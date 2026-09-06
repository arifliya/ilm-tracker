import { Hono } from "hono";
import type { AppEnv } from "../../types/env";
import bcrypt from "bcryptjs";
import { authMiddleware } from "../../middleware/auth";
import { isFeatureEnabled } from "../../utils/featureFlags";
import { generateTemporaryPassword } from "../../utils/tempPassword";
import { createStudentLogin } from "../../utils/studentAccount";
import { checkRateLimit } from "../../utils/rateLimit";
import { HttpError } from "../../utils/httpError";
import {
  STAFF_MGMT,
  USER_MGMT,
  isPlatformWide,
  inRequesterScope,
  getUserSchoolId,
  getUserRequestedRole,
  getUserRoleName,
  getStudentSchoolId,
  getParentSchoolId,
  detachUserDependencies
} from "./shared";
import type { IdRow } from "./shared";

const router = new Hono<AppEnv>();

interface UsersAllRow {
  total_count: string;
  id: number;
  username: string;
  user_email: string | null;
  role: string;
  school_name: string | null;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  parent_date_of_birth: string | null;
  parent_address1: string | null;
  parent_address2: string | null;
  parent_address3: string | null;
  parent_city: string | null;
  parent_postcode: string | null;
  parent_medical_condition: string | null;
  parent_email: string | null;
  staff_first_name: string | null;
  staff_middle_name: string | null;
  staff_last_name: string | null;
  staff_date_of_birth: string | null;
  staff_address1: string | null;
  staff_address2: string | null;
  staff_address3: string | null;
  staff_city: string | null;
  staff_postcode: string | null;
  staff_medical_condition: string | null;
  staff_disability: string | null;
  staff_email: string | null;
  students: unknown;
}

const USERS_ALL_PAGE_SIZE = 20;
const USERS_ALL_MAX_PAGE_SIZE = 100;

/* ============================================================
   GET ALL USERS WITH FULL DETAILS (strict SQL mode safe)
   Option C — Parent-only student display
   Paginated, server-side-searched-by-username, server-side-sorted —
   this table has no per-row cap otherwise, and a real school's user count
   won't stay at seed-data scale forever. COUNT(*) OVER() rides along on
   the same query (computed post-GROUP-BY, pre-LIMIT, per SQL's logical
   processing order — exactly the distinct-user count this needs) instead
   of a separate COUNT query.
   ============================================================ */
router.get("/users-all", authMiddleware, USER_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;

  const pageParam = Number(c.req.query("page"));
  const page = Number.isInteger(pageParam) && pageParam >= 0 ? pageParam : 0;
  const pageSizeParam = Number(c.req.query("pageSize"));
  const pageSize =
    Number.isInteger(pageSizeParam) && pageSizeParam > 0
      ? Math.min(pageSizeParam, USERS_ALL_MAX_PAGE_SIZE)
      : USERS_ALL_PAGE_SIZE;
  const search = (c.req.query("search") || "").trim();
  const sortDir = c.req.query("sort") === "za" ? "DESC" : "ASC";

  const params: any[] = [];
  const conditions: string[] = [];
  if (!isPlatformWide(user)) {
    params.push(user.schoolId);
    conditions.push(`u.school_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`u.username ILIKE $${params.length}`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(pageSize);
  const limitPlaceholder = `$${params.length}`;
  params.push(page * pageSize);
  const offsetPlaceholder = `$${params.length}`;

  const { rows } = await db.query<UsersAllRow>(
    `
    SELECT
      COUNT(*) OVER() AS total_count,
      u.id,
      u.username,
      u.email AS user_email,
      r.name AS role,
      sc.name AS school_name,

      /* Parent details (1-to-1) */
      MAX(p.first_name) AS parent_first_name,
      MAX(p.middle_name) AS parent_middle_name,
      MAX(p.surname) AS parent_last_name,
      TO_CHAR(MAX(p.date_of_birth), 'YYYY-MM-DD') AS parent_date_of_birth,
      MAX(p.address1) AS parent_address1,
      MAX(p.address2) AS parent_address2,
      MAX(p.address3) AS parent_address3,
      MAX(p.city) AS parent_city,
      MAX(p.postcode) AS parent_postcode,
      MAX(p.medical_condition) AS parent_medical_condition,
      MAX(p.email) AS parent_email,

      /* Staff details (1-to-1) */
      MAX(s.first_name) AS staff_first_name,
      MAX(s.middle_name) AS staff_middle_name,
      MAX(s.surname) AS staff_last_name,
      TO_CHAR(MAX(s.date_of_birth), 'YYYY-MM-DD') AS staff_date_of_birth,
      MAX(s.address1) AS staff_address1,
      MAX(s.address2) AS staff_address2,
      MAX(s.address3) AS staff_address3,
      MAX(s.city) AS staff_city,
      MAX(s.postcode) AS staff_postcode,
      MAX(s.medical_condition) AS staff_medical_condition,
      MAX(s.disability) AS staff_disability,
      MAX(s.email) AS staff_email,

      /* Students (parent-linked only) */
      COALESCE(
        json_agg(
          CASE WHEN st.id IS NOT NULL THEN
            json_build_object(
              'id', st.id,
              'first_name', st.first_name,
              'surname', st.surname,
              'address1', st.address1
            )
          ELSE NULL END
        ),
        '[]'::json
      ) AS students

    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN schools sc ON sc.id = u.school_id

    LEFT JOIN parents p ON p.user_id = u.id
    LEFT JOIN staff_details s ON s.user_id = u.id
    LEFT JOIN student_guardians sg ON sg.parent_id = p.id AND sg.status = 'approved'
    LEFT JOIN students st ON st.id = sg.student_id

    ${whereClause}
    GROUP BY u.id, r.name, sc.name
    ORDER BY u.username ${sortDir}
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `,
    params
  );

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

  const normalized = rows.map(u => {
    // The Postgres driver already parses a json_agg result into a native
    // JS array/object (json/jsonb columns are auto-parsed) — only fall
    // back to JSON.parse for configs where it comes back as a raw string.
    let students = [];
    if (Array.isArray(u.students)) {
      students = u.students.filter(Boolean);
    } else {
      try {
        students = JSON.parse((u.students as string) || "[]").filter(Boolean);
      } catch {
        students = [];
      }
    }

    let first_name = null;
    let middle_name = null;
    let last_name = null;
    let date_of_birth = null;
    let email = u.user_email;
    let address1 = null;
    let address2 = null;
    let address3 = null;
    let city = null;
    let postcode = null;
    let medical_condition = null;
    let disability = null;

    /* Parent user */
    if (u.role === "parent") {
      first_name = u.parent_first_name;
      middle_name = u.parent_middle_name;
      last_name = u.parent_last_name;
      date_of_birth = u.parent_date_of_birth;
      email = u.parent_email || email;
      address1 = u.parent_address1;
      address2 = u.parent_address2;
      address3 = u.parent_address3;
      city = u.parent_city;
      postcode = u.parent_postcode;
      medical_condition = u.parent_medical_condition;
    }

    /* Staff roles */
    if (["teacher", "admin", "maintainer", "staff"].includes(u.role)) {
      first_name = u.staff_first_name || first_name;
      middle_name = u.staff_middle_name || middle_name;
      last_name = u.staff_last_name || last_name;
      date_of_birth = u.staff_date_of_birth || date_of_birth;
      email = u.staff_email || email;
      address1 = u.staff_address1 || address1;
      address2 = u.staff_address2 || address2;
      address3 = u.staff_address3 || address3;
      city = u.staff_city || city;
      postcode = u.staff_postcode || postcode;
      medical_condition = u.staff_medical_condition || medical_condition;
      disability = u.staff_disability;
    }

    /* Owner */
    if (u.role === "owner") {
      first_name = u.staff_first_name || u.parent_first_name || first_name;
      middle_name = u.staff_middle_name || u.parent_middle_name || middle_name;
      last_name = u.staff_last_name || u.parent_last_name || last_name;
      date_of_birth = u.staff_date_of_birth || u.parent_date_of_birth || date_of_birth;
      email = u.staff_email || u.parent_email || email;
      address1 = u.staff_address1 || u.parent_address1 || address1;
      address2 = u.staff_address2 || u.parent_address2 || address2;
      address3 = u.staff_address3 || u.parent_address3 || address3;
      city = u.staff_city || u.parent_city || city;
      postcode = u.staff_postcode || u.parent_postcode || postcode;
      medical_condition = u.staff_medical_condition || u.parent_medical_condition || medical_condition;
      disability = u.staff_disability || disability;
    }


    /* Student user — Option C: NO DETAILS */
    if (u.role === "student") {
      first_name = null;
      last_name = null;
      address1 = null;
      students = []; // student users do NOT show student cards
    }

    return {
      id: u.id,
      username: u.username,
      role: u.role,
      school_name: u.school_name,
      email,
      first_name,
      middle_name,
      last_name,
      date_of_birth,
      address1,
      address2,
      address3,
      city,
      postcode,
      medical_condition,
      disability,
      students
    };
  });

  return c.json({ users: normalized, total });
});

/* ============================================================
   GET PENDING USERS (WITH REQUESTED ROLE + BASIC DETAILS)
   ============================================================ */
interface PendingUserRow {
  total_count: string;
  id: number;
  username: string;
  email: string | null;
  requested_role: string | null;
  school_name: string | null;
  first_name: string | null;
  last_name: string | null;
  contact_number: string | null;
}

const PENDING_USERS_PAGE_SIZE = 20;
const PENDING_USERS_MAX_PAGE_SIZE = 100;

router.get("/pending-users", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;

  const pageParam = Number(c.req.query("page"));
  const page = Number.isInteger(pageParam) && pageParam >= 0 ? pageParam : 0;
  const pageSizeParam = Number(c.req.query("pageSize"));
  const pageSize =
    Number.isInteger(pageSizeParam) && pageSizeParam > 0
      ? Math.min(pageSizeParam, PENDING_USERS_MAX_PAGE_SIZE)
      : PENDING_USERS_PAGE_SIZE;
  const search = (c.req.query("search") || "").trim();
  const sortDir = c.req.query("sort") === "za" ? "DESC" : "ASC";

  const params: any[] = [];
  const conditions: string[] = ["r.name = 'pending'"];
  if (!isPlatformWide(user)) {
    params.push(user.schoolId);
    conditions.push(`u.school_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`u.username ILIKE $${params.length}`);
  }

  params.push(pageSize);
  const limitPlaceholder = `$${params.length}`;
  params.push(page * pageSize);
  const offsetPlaceholder = `$${params.length}`;

  const { rows } = await db.query<PendingUserRow>(
    `SELECT
       COUNT(*) OVER() AS total_count,
       u.id,
       u.username,
       u.email,
       u.requested_role,
       sc.name AS school_name,
       COALESCE(p.first_name, s.first_name) AS first_name,
       COALESCE(p.surname, s.surname) AS last_name,
       COALESCE(p.contact_number, s.phone_number) AS contact_number
     FROM users u
     JOIN roles r ON u.role_id = r.id
     LEFT JOIN schools sc ON sc.id = u.school_id
     LEFT JOIN parents p ON p.user_id = u.id
     LEFT JOIN staff_details s ON s.user_id = u.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY u.username ${sortDir}
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    params
  );

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const pendingUsers = rows.map(({ total_count: _total_count, ...rest }) => rest);

  return c.json({ pendingUsers, total });
});

/* ============================================================
   APPROVE USER
   ============================================================ */
router.post("/approve/:id", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const userId = c.req.param("id")!;
  const { role } = await c.req.json();

  if (!role) return c.json({ message: "Role required" }, 400);

  // Admins may only grant roles up to their own privilege level — never owner/maintainer/system_admin
  if (user.role === "admin" && ["owner", "maintainer", "system_admin"].includes(role)) {
    return c.json({ message: "Admins cannot grant owner, maintainer, or system admin roles" }, 403);
  }

  // Owners sit below system_admin — they cannot grant system_admin
  if (user.role === "owner" && role === "system_admin") {
    return c.json({ message: "Owners cannot grant the system admin role" }, 403);
  }

  const targetSchoolId = await getUserSchoolId(db, userId);
  if (targetSchoolId === null || !inRequesterScope(user, targetSchoolId)) {
    return c.json({ message: "User not found" }, 404);
  }

  // system_admin is platform-wide and handles staff onboarding across
  // schools, but parent approvals are a school-level decision — those stay
  // with that school's own admin/owner.
  if (isPlatformWide(user) && (await getUserRequestedRole(db, userId)) === "parent") {
    return c.json(
      { message: "System admins cannot approve parent registrations — this must be done by the school's admin or owner" },
      403
    );
  }

  const { rows: roleRows } = await db.query<IdRow>("SELECT id FROM roles WHERE name = $1", [role]);

  const roleId = roleRows[0]?.id;
  if (!roleId) return c.json({ message: "Invalid role" }, 400);

  await db.query("UPDATE users SET role_id = $1, requested_role = NULL WHERE id = $2", [roleId, userId]);

  // A newly-approved parent may have submitted guardian_links to existing
  // children alongside their registration — those were inserted 'pending'
  // since the child wasn't theirs to claim outright. Approving the account
  // is the admin's one review of this whole submission, so flip those too
  // rather than making the admin approve the same registration twice.
  const studentAccounts: { studentId: number; name: string; username: string; temporaryPassword: string }[] = [];
  if (role === "parent") {
    const { rows: parentRows } = await db.query<IdRow>("SELECT id FROM parents WHERE user_id = $1", [userId]);
    const parent = parentRows[0];
    if (parent) {
      await db.query(
        "UPDATE student_guardians SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE parent_id = $1 AND status = 'pending'",
        [parent.id]
      );

      // Every approved guardian link is a point where a child might not
      // have a login yet — first-time registration, or a second guardian
      // just approved onto an already-enrolled sibling. Provision one for
      // each, same temp-password/forced-reset mechanism as an admin reset.
      if (await isFeatureEnabled(db, "password_management", targetSchoolId)) {
        interface ChildRow {
          id: number;
          first_name: string | null;
          surname: string | null;
        }
        const { rows: childRows } = await db.query<ChildRow>(
          `SELECT s.id, s.first_name, s.surname FROM student_guardians sg
           JOIN students s ON s.id = sg.student_id
           WHERE sg.parent_id = $1 AND sg.status = 'approved' AND s.user_id IS NULL`,
          [parent.id]
        );
        if (childRows.length > 0) {
          const { rows: studentRoleRows } = await db.query<IdRow>("SELECT id FROM roles WHERE name = 'student'");
          const studentRoleId = studentRoleRows[0]?.id;
          for (const child of childRows) {
            const { username, temporaryPassword } = await createStudentLogin(db, {
              studentId: child.id,
              // Nullable in the schema, but every students-insert path (register-parent,
              // parent add-child, bulk-upload) requires these fields — never actually null here.
              firstName: child.first_name!,
              surname: child.surname!,
              schoolId: targetSchoolId,
              studentRoleId
            });
            studentAccounts.push({
              studentId: child.id,
              name: `${child.first_name} ${child.surname}`,
              username,
              temporaryPassword
            });
          }
        }
      }
    }
  }

  return c.json({ message: "User approved", studentAccounts });
});

/* ============================================================
   REJECT USER
   ============================================================ */
router.post("/reject/:id", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const userId = c.req.param("id")!;

  const targetSchoolId = await getUserSchoolId(db, userId);
  if (targetSchoolId === null || !inRequesterScope(user, targetSchoolId)) {
    return c.json({ message: "User not found" }, 404);
  }

  if (isPlatformWide(user) && (await getUserRequestedRole(db, userId)) === "parent") {
    return c.json(
      { message: "System admins cannot reject parent registrations — this must be done by the school's admin or owner" },
      403
    );
  }

  // Pending registrations aren't real enrollments yet, so rejecting one
  // wipes the whole submission — but with multiple guardians possible, a
  // student this parent is linked to might not have been CREATED by this
  // registration (e.g. a guardian_links request to a child that already
  // has another approved guardian) — that student must survive rejection.
  // Only students where this parent is the sole (only ever) guardian were
  // created by this registration, so only those get wiped entirely; any
  // other pending link is just a request and gets dropped on its own.
  const { rows: parentRows } = await db.query<IdRow>("SELECT id FROM parents WHERE user_id = $1", [userId]);
  const parent = parentRows[0];

  if (parent) {
    interface StudentIdRow {
      student_id: number;
    }
    const { rows: soleRows } = await db.query<StudentIdRow>(
      `SELECT sg.student_id FROM student_guardians sg
       WHERE sg.parent_id = $1
         AND (SELECT COUNT(*) FROM student_guardians sg2 WHERE sg2.student_id = sg.student_id) = 1`,
      [parent.id]
    );
    const soleStudentIds = soleRows.map(r => r.student_id);
    if (soleStudentIds.length > 0) {
      await db.query("DELETE FROM student_classes WHERE student_id = ANY($1)", [soleStudentIds]);
      await db.query("DELETE FROM students WHERE id = ANY($1)", [soleStudentIds]);
    }
    // Any remaining student_guardians rows for this parent are requests
    // against children that already had another guardian — drop the
    // request only, leave the student alone.
    await db.query("DELETE FROM student_guardians WHERE parent_id = $1", [parent.id]);
    await db.query("DELETE FROM parents WHERE id = $1", [parent.id]);
  }

  await db.query("DELETE FROM staff_details WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM users WHERE id = $1", [userId]);

  return c.json({ message: "User rejected" });
});
/* ============================================================
   RESET A USER'S PASSWORD — FOR A LOCKED-OUT ACCOUNT
   Behind the "password_management" flag, checked against the TARGET's
   school (not the caller's) — same resource-scoped pattern reportCards.ts
   uses. Same escalation rules as /approve/:id: admin cannot act on
   owner/maintainer/system_admin; owner cannot act on system_admin.
   ============================================================ */
router.post("/users/:id/reset-password", authMiddleware, STAFF_MGMT, async c => {
  if (!(await checkRateLimit(c, { key: "reset-password", limit: 30, windowSeconds: 3600 }))) {
    return c.json({ message: "Too many password resets. Please try again later." }, 429);
  }

  const db = c.get("db");
  const user = c.get("user")!;
  const userId = c.req.param("id")!;

  const targetSchoolId = await getUserSchoolId(db, userId);
  if (targetSchoolId === null || !inRequesterScope(user, targetSchoolId)) {
    return c.json({ message: "User not found" }, 404);
  }

  const targetRole = await getUserRoleName(db, userId);

  if (user.role === "admin" && targetRole && ["owner", "maintainer", "system_admin"].includes(targetRole)) {
    return c.json({ message: "Admins cannot reset the password of an owner, maintainer, or system admin" }, 403);
  }
  if (user.role === "owner" && targetRole === "system_admin") {
    return c.json({ message: "Owners cannot reset a system admin's password" }, 403);
  }

  if (!(await isFeatureEnabled(db, "password_management", targetSchoolId))) {
    return c.json({ message: "Password management is currently disabled for this school" }, 403);
  }

  const temporaryPassword = generateTemporaryPassword();
  const newHash = await bcrypt.hash(temporaryPassword, 10);

  await db.query(
    "UPDATE users SET password_hash = $1, token_version = token_version + 1, must_reset_password = TRUE WHERE id = $2",
    [newHash, userId]
  );

  return c.json({ message: "Password reset", temporaryPassword });
});

/* ============================================================
   GENERATE A LOGIN FOR A STUDENT WHO DOESN'T HAVE ONE YET
   Backfill for students enrolled before login provisioning existed, and
   a manual fallback if auto-provisioning was skipped (e.g. the
   password_management flag was off at approval/bulk-upload time). Once a
   student has a user_id, further password changes go through the regular
   /users/:id/reset-password endpoint above, not this one.
   ============================================================ */
interface StudentLoginRow {
  school_id: number;
  user_id: number | null;
  first_name: string | null;
  surname: string | null;
}

router.post("/students/:id/generate-login", authMiddleware, STAFF_MGMT, async c => {
  if (!(await checkRateLimit(c, { key: "reset-password", limit: 30, windowSeconds: 3600 }))) {
    return c.json({ message: "Too many password resets. Please try again later." }, 429);
  }

  const db = c.get("db");
  const user = c.get("user")!;
  const studentId = c.req.param("id")!;

  const { rows } = await db.query<StudentLoginRow>(
    "SELECT school_id, user_id, first_name, surname FROM students WHERE id = $1",
    [studentId]
  );
  const student = rows[0];
  if (!student || !inRequesterScope(user, student.school_id)) {
    return c.json({ message: "Student not found" }, 404);
  }

  if (student.user_id) {
    return c.json({ message: "This student already has a login — use Reset Password instead" }, 400);
  }

  if (!(await isFeatureEnabled(db, "password_management", student.school_id))) {
    return c.json({ message: "Password management is currently disabled for this school" }, 403);
  }

  const { rows: studentRoleRows } = await db.query<IdRow>("SELECT id FROM roles WHERE name = 'student'");
  const studentRoleId = studentRoleRows[0]?.id;
  if (!studentRoleId) {
    return c.json({ message: "Student role missing in DB" }, 500);
  }

  const { username, temporaryPassword } = await createStudentLogin(db, {
    studentId: Number(studentId),
    // Nullable in the schema, but every students-insert path (register-parent,
    // parent add-child, bulk-upload) requires these fields — never actually null here.
    firstName: student.first_name!,
    surname: student.surname!,
    schoolId: student.school_id,
    studentRoleId
  });

  return c.json({ message: "Login created", username, temporaryPassword });
});

/* ============================================================
   REMOVE STUDENT (FIRST)
   ============================================================ */
router.delete("/remove-student/:id", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const studentId = c.req.param("id")!;

  const studentSchoolId = await getStudentSchoolId(db, studentId);
  if (studentSchoolId === null || !inRequesterScope(user, studentSchoolId)) {
    return c.json({ message: "Student not found" }, 404);
  }

  await db.query("DELETE FROM student_classes WHERE student_id = $1", [studentId]);
  await db.query("DELETE FROM students WHERE id = $1", [studentId]);

  return c.json({ message: "Student removed" });
});

/* ============================================================
   REMOVE PARENT (ONLY IF NO STUDENTS)
   ============================================================ */
interface CountRow {
  cnt: string;
}

interface UserIdRow {
  user_id: number;
}

router.delete("/remove-parent/:id", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const parentId = c.req.param("id")!;

  const parentSchoolId = await getParentSchoolId(db, parentId);
  if (parentSchoolId === null || !inRequesterScope(user, parentSchoolId)) {
    return c.json({ message: "Parent not found" }, 404);
  }

  const { rows } = await db.query<CountRow>(
    "SELECT COUNT(*) AS cnt FROM student_guardians WHERE parent_id = $1 AND status = 'approved'",
    [parentId]
  );
  const count = Number(rows[0]?.cnt || 0);

  if (count > 0) {
    return c.json({ message: "Remove all linked students before removing this parent" }, 400);
  }

  const { rows: parentRows } = await db.query<UserIdRow>("SELECT user_id FROM parents WHERE id = $1", [parentId]);
  const userId = parentRows[0]?.user_id;

  await db.query("DELETE FROM parents WHERE id = $1", [parentId]);

  // Also remove the login itself — otherwise a "removed" parent can
  // still sign in afterward.
  if (userId) {
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
  }

  return c.json({ message: "Parent removed" });
});


/* ============================================================
   DELETE USER (NEW)
   ============================================================ */
interface RoleSchoolRow {
  role: string;
  school_id: number | null;
}

router.delete("/users/:id", authMiddleware, USER_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const userId = Number(c.req.param("id"));

  // Prevent deleting the system owner or a system admin
  const { rows } = await db.query<RoleSchoolRow>(
    `SELECT r.name AS role, u.school_id
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1`,
    [userId]
  );

  const targetUser = rows[0];
  if (!targetUser || !inRequesterScope(user, targetUser.school_id)) {
    return c.json({ message: "User not found" }, 404);
  }

  if (targetUser.role === "owner" || targetUser.role === "system_admin") {
    return c.json({ message: "Owner and system admin accounts cannot be deleted" }, 403);
  }

  const cleanup = await detachUserDependencies(db, userId);
  if (!cleanup.ok) {
    return c.json({ message: cleanup.message }, 400);
  }

  // Delete user
  await db.query("DELETE FROM users WHERE id = $1", [userId]);

  return c.json({ message: "User deleted" });
});

/* ============================================================
   UPDATE USER DETAILS (parent or staff profile fields)
   ============================================================ */
router.put("/users/:id/update-details", authMiddleware, USER_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const userId = Number(c.req.param("id"));
  const {
    first_name,
    middle_name,
    last_name,
    date_of_birth,
    address1,
    address2,
    address3,
    city,
    postcode,
    medical_condition,
    disability,
    email
  } = await c.req.json();

  const { rows: roleRows } = await db.query<RoleSchoolRow>(
    `SELECT r.name AS role, u.school_id
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1`,
    [userId]
  );
  const targetUser = roleRows[0];
  const role = targetUser?.role;

  if (!role || !inRequesterScope(user, targetUser.school_id)) {
    return c.json({ message: "User not found" }, 404);
  }

  try {
    if (role === "parent") {
      const { rows: existing } = await db.query<IdRow>("SELECT id FROM parents WHERE user_id = $1", [userId]);

      if (existing.length > 0) {
        await db.query(
          `UPDATE parents
           SET first_name = $1, middle_name = $2, surname = $3, date_of_birth = $4,
               address1 = $5, address2 = $6, address3 = $7, city = $8, postcode = $9,
               medical_condition = $10, email = $11
           WHERE user_id = $12`,
          [
            first_name || null,
            middle_name || null,
            last_name || null,
            date_of_birth || null,
            address1 || null,
            address2 || null,
            address3 || null,
            city || null,
            postcode || null,
            medical_condition || null,
            email || null,
            userId
          ]
        );
      } else {
        await db.query(
          `INSERT INTO parents
             (user_id, first_name, middle_name, surname, date_of_birth,
              address1, address2, address3, city, postcode, medical_condition, email)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            userId,
            first_name || null,
            middle_name || null,
            last_name || null,
            date_of_birth || null,
            address1 || null,
            address2 || null,
            address3 || null,
            city || null,
            postcode || null,
            medical_condition || null,
            email || null
          ]
        );
      }
    } else if (["teacher", "admin", "maintainer", "owner", "staff", "system_admin"].includes(role)) {
      const { rows: existing } = await db.query<IdRow>("SELECT id FROM staff_details WHERE user_id = $1", [userId]);

      if (existing.length > 0) {
        await db.query(
          `UPDATE staff_details
           SET first_name = $1, middle_name = $2, surname = $3, date_of_birth = $4,
               address1 = $5, address2 = $6, address3 = $7, city = $8, postcode = $9,
               medical_condition = $10, disability = $11, email = $12
           WHERE user_id = $13`,
          [
            first_name || null,
            middle_name || null,
            last_name || null,
            date_of_birth || null,
            address1 || null,
            address2 || null,
            address3 || null,
            city || null,
            postcode || null,
            medical_condition || null,
            disability || null,
            email || null,
            userId
          ]
        );
      } else {
        await db.query(
          `INSERT INTO staff_details
             (user_id, first_name, middle_name, surname, date_of_birth,
              address1, address2, address3, city, postcode, medical_condition, disability, email)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            userId,
            first_name || null,
            middle_name || null,
            last_name || null,
            date_of_birth || null,
            address1 || null,
            address2 || null,
            address3 || null,
            city || null,
            postcode || null,
            medical_condition || null,
            disability || null,
            email || null
          ]
        );
      }
    } else {
      return c.json({ message: "This user's role does not support detail editing" }, 400);
    }

    // Keep the login-lookup email in sync with the profile email
    if (email) {
      await db.query("UPDATE users SET email = $1 WHERE id = $2", [email, userId]);
    }
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new HttpError(409, "Another account already uses this email");
    }
    throw err;
  }

  return c.json({ message: "User details updated" });
});


export default router;
