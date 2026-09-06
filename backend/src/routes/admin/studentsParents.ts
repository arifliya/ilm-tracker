import { Hono } from "hono";
import type { AppEnv } from "../../types/env";
import { authMiddleware } from "../../middleware/auth";
import { STAFF_MGMT, isPlatformWide, parsePageParams } from "./shared";

const router = new Hono<AppEnv>();

const STUDENTS_PARENTS_PAGE_SIZE = 20;
const STUDENTS_PARENTS_MAX_PAGE_SIZE = 100;
const PARENTS_PAGE_SIZE = 20;
const PARENTS_MAX_PAGE_SIZE = 100;

/* ============================================================
   STUDENTS + PARENTS OVERVIEW

   Called two ways, same as /teachers above: with no page/pageSize (the
   "choose a student" dropdown in ClassManagementSection, which needs
   every student in scope, not one page) returns the plain array this
   endpoint always returned; with page/pageSize (the actual overview/
   remove-users tables — StudentParentOverviewSection, ReportCardsSection,
   RemoveUsersSection, SystemAdminRemoveUsersSection) returns
   { studentsParents, total } instead. search matches the student's own
   name or any of their guardians' names — guardians are matched via
   EXISTS rather than in the main join's WHERE clause, since filtering the
   join directly would also drop non-matching guardians of an otherwise-
   matching student out of the aggregated guardians list.
   ============================================================ */
router.get("/students-parents", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const { paginated, page, pageSize, search, sortDir } = parsePageParams(
    c,
    STUDENTS_PARENTS_PAGE_SIZE,
    STUDENTS_PARENTS_MAX_PAGE_SIZE
  );

  const params: any[] = [];
  const conditions: string[] = [];
  if (!isPlatformWide(user)) {
    params.push(user.schoolId);
    conditions.push(`s.school_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    const searchPlaceholder = `$${params.length}`;
    conditions.push(
      `(s.first_name ILIKE ${searchPlaceholder} OR s.surname ILIKE ${searchPlaceholder} OR EXISTS (
         SELECT 1 FROM student_guardians sg2
         JOIN parents p2 ON p2.id = sg2.parent_id
         WHERE sg2.student_id = s.id AND sg2.status = 'approved'
           AND (p2.first_name ILIKE ${searchPlaceholder} OR p2.surname ILIKE ${searchPlaceholder})
       ))`
    );
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let limitOffsetClause = "";
  if (paginated) {
    params.push(pageSize);
    limitOffsetClause += ` LIMIT $${params.length}`;
    params.push(page * pageSize);
    limitOffsetClause += ` OFFSET $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT
       COUNT(*) OVER() AS total_count,
       s.id AS student_id,
       s.school_id AS student_school_id,
       s.user_id AS student_user_id,
       s.first_name AS student_first_name,
       s.middle_name AS student_middle_name,
       s.surname AS student_last_name,
       s.gender AS student_gender,
       s.date_of_birth AS student_date_of_birth,
       s.address1 AS student_address1,
       s.address2 AS student_address2,
       s.address3 AS student_address3,
       s.city AS student_city,
       s.postcode AS student_postcode,
       s.medical_condition AS student_medical_condition,
       s.guardian_code AS student_guardian_code,

       c.id AS class_id,
       c.class_name AS class_name,

       json_agg(
         json_build_object(
           'parent_id', p.id,
           'user_id', p.user_id,
           'first_name', p.first_name,
           'middle_name', p.middle_name,
           'surname', p.surname,
           'relationship_to_student', p.relationship_to_student,
           'contact_number', p.contact_number,
           'email', p.email,
           'medical_condition', p.medical_condition,
           'address1', p.address1,
           'address2', p.address2,
           'address3', p.address3,
           'city', p.city,
           'postcode', p.postcode
         )
       ) AS guardians

     FROM students s
     JOIN student_guardians sg ON sg.student_id = s.id AND sg.status = 'approved'
     JOIN parents p ON p.id = sg.parent_id
     LEFT JOIN student_classes a ON a.student_id = s.id
     LEFT JOIN classes c ON c.id = a.class_id
     ${whereClause}
     GROUP BY s.id, c.id
     ORDER BY s.first_name ${sortDir}, s.surname ${sortDir}${limitOffsetClause}`,
    params
  );

  const studentsParents = rows.map(({ total_count: _total_count, ...row }: any) => {
    // The Postgres driver already parses a json_agg result into a native
    // JS array/object (json/jsonb columns are auto-parsed) — only fall
    // back to JSON.parse for configs where it comes back as a raw string.
    let guardians: any[] = [];
    if (Array.isArray(row.guardians)) {
      guardians = row.guardians;
    } else {
      try {
        guardians = JSON.parse(row.guardians || "[]");
      } catch {
        guardians = [];
      }
    }
    return { ...row, guardians };
  });

  if (!paginated) {
    return c.json(studentsParents);
  }

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return c.json({ studentsParents, total });
});

/* ============================================================
   ALL PARENTS (INCLUDING THOSE WITH NO STUDENTS LEFT)
   students-parents above is an inner join from students, so a parent
   whose last child was removed drops out of it entirely — this endpoint
   exists so Remove Users can still find and remove that parent.

   Same dual mode as /teachers and /students-parents: no page/pageSize is
   the "select an existing parent" dropdown in StudentParentOverviewSection
   (needs every parent in scope); page/pageSize is the actual Remove
   Parents / Password Management tables.
   ============================================================ */
router.get("/parents", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const { paginated, page, pageSize, search, sortDir } = parsePageParams(c, PARENTS_PAGE_SIZE, PARENTS_MAX_PAGE_SIZE);

  const params: any[] = [];
  const conditions: string[] = [];
  if (!isPlatformWide(user)) {
    params.push(user.schoolId);
    conditions.push(`p.school_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    const searchPlaceholder = `$${params.length}`;
    conditions.push(`(p.first_name ILIKE ${searchPlaceholder} OR p.surname ILIKE ${searchPlaceholder})`);
  }
  // Not every parent has a login (some are added without one) —
  // PasswordManagementSection only wants ones it can actually reset a
  // password for. Optional so every other caller (Remove Parents, the
  // assign-guardian dropdown) keeps seeing every parent regardless.
  if (c.req.query("hasLogin") === "true") {
    conditions.push("p.user_id IS NOT NULL");
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let limitOffsetClause = "";
  if (paginated) {
    params.push(pageSize);
    limitOffsetClause += ` LIMIT $${params.length}`;
    params.push(page * pageSize);
    limitOffsetClause += ` OFFSET $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT
       COUNT(*) OVER() AS total_count,
       p.id AS parent_id,
       p.user_id AS parent_user_id,
       p.school_id AS parent_school_id,
       p.first_name AS parent_first_name,
       p.surname AS parent_last_name,
       p.contact_number AS parent_contact_number,
       p.email AS parent_email,
       COUNT(DISTINCT sg.student_id) AS student_count
     FROM parents p
     LEFT JOIN student_guardians sg ON sg.parent_id = p.id AND sg.status = 'approved'
     ${whereClause}
     GROUP BY p.id
     ORDER BY p.surname ${sortDir}, p.first_name ${sortDir}${limitOffsetClause}`,
    params
  );

  if (!paginated) {
    return c.json(rows.map(({ total_count: _total_count, ...row }: any) => row));
  }

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const parents = rows.map(({ total_count: _total_count, ...row }: any) => row);
  return c.json({ parents, total });
});

/* ============================================================
   STUDENTS ASSIGNED TO CLASSES (FOR UI TABLE)
   ============================================================ */
router.get("/assigned-students", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const params: any[] = [];
  let schoolFilter = "";
  if (!isPlatformWide(user)) {
    schoolFilter = "WHERE c.school_id = $1";
    params.push(user.schoolId);
  }

  const { rows } = await db.query(
    `SELECT
       sc.class_id,
       c.class_name,
       s.id AS student_id,
       s.first_name AS student_first_name,
       s.surname AS student_last_name
     FROM student_classes sc
     JOIN classes c ON c.id = sc.class_id
     JOIN students s ON s.id = sc.student_id
     ${schoolFilter}
     ORDER BY c.class_name ASC, s.first_name ASC`,
    params
  );

  return c.json(rows);
});


export default router;
