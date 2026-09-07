import { Hono } from "hono";
import type { AppEnv } from "../../types/env";
import { authMiddleware } from "../../middleware/auth";
import {
  STAFF_MGMT,
  isPlatformWide,
  inRequesterScope,
  getUserSchoolId,
  detachUserDependencies,
  parsePageParams
} from "./shared";

const router = new Hono<AppEnv>();

const TEACHERS_PAGE_SIZE = 20;
const TEACHERS_MAX_PAGE_SIZE = 100;

/* ============================================================
   GET ALL TEACHERS + THEIR ASSIGNED CLASSES

   Called two ways by the frontend: with no page/pageSize (every "pick a
   teacher" dropdown — TimetableSection, and this same route's own "Assign
   Teacher to Class" dropdown — needs every teacher, not one page of them)
   returns the plain array this endpoint always returned; with page/
   pageSize (TeacherDirectorySection's actual directory table) returns
   { teachers, total } instead, paginated/searched/sorted server-side —
   see parsePageParams's own comment for why this endpoint needs both
   modes where users-all/pending-users only ever needed one.
   ============================================================ */
router.get("/teachers", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const { paginated, page, pageSize, search, sortDir } = parsePageParams(c, TEACHERS_PAGE_SIZE, TEACHERS_MAX_PAGE_SIZE);

  const params: any[] = [];
  const conditions: string[] = ["r.name = 'teacher'"];
  if (!isPlatformWide(user)) {
    params.push(user.schoolId);
    conditions.push(`u.school_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`u.username ILIKE $${params.length}`);
  }

  let limitOffsetClause = "";
  if (paginated) {
    params.push(pageSize);
    limitOffsetClause += ` LIMIT $${params.length}`;
    params.push(page * pageSize);
    limitOffsetClause += ` OFFSET $${params.length}`;
  }

  interface TeacherRow {
    total_count: string;
    teacher_id: number;
    username: string;
    email: string | null;
    first_name: string | null;
    surname: string | null;
    assigned_classes: unknown;
  }

  const { rows } = await db.query<TeacherRow>(
    `SELECT
       COUNT(*) OVER() AS total_count,
       u.id AS teacher_id,
       u.username,
       u.email,
       sd.first_name,
       sd.surname,
       COALESCE(
         json_agg(
           CASE WHEN c.id IS NOT NULL THEN
             json_build_object('id', c.id, 'class_name', c.class_name, 'year_group', c.year_group)
           ELSE NULL END
         ) FILTER (WHERE c.id IS NOT NULL),
         '[]'::json
       ) AS assigned_classes
     FROM users u
     JOIN roles r ON u.role_id = r.id
     LEFT JOIN staff_details sd ON sd.user_id = u.id
     LEFT JOIN teacher_classes tc ON tc.teacher_id = u.id
     LEFT JOIN classes c ON c.id = tc.class_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY u.id, u.username, u.email, sd.first_name, sd.surname
     ORDER BY u.username ${sortDir}${limitOffsetClause}`,
    params
  );

  const teachers = rows.map(row => {
    // json_agg comes back pre-parsed into a real array on the Postgres
    // driver's default row mode — only fall back to JSON.parse for a
    // config where it arrives as a raw string, same pattern as
    // students-parents/users-all's own json_agg columns.
    let assigned_classes: { id: number; class_name: string | null; year_group: string | null }[] = [];
    if (Array.isArray(row.assigned_classes)) {
      assigned_classes = row.assigned_classes;
    } else {
      try {
        assigned_classes = JSON.parse((row.assigned_classes as string) || "[]");
      } catch {
        assigned_classes = [];
      }
    }
    return {
      id: row.teacher_id,
      username: row.username,
      email: row.email,
      first_name: row.first_name,
      surname: row.surname,
      assigned_classes
    };
  });

  if (!paginated) {
    return c.json(teachers);
  }

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return c.json({ teachers, total });
});

/* ============================================================
   DELETE TEACHER (OPTIONAL, USED BY UI)
   ============================================================ */
router.delete("/teachers/:id", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const teacherId = Number(c.req.param("id"));

  const teacherSchoolId = await getUserSchoolId(db, teacherId);
  if (teacherSchoolId === null || !inRequesterScope(user, teacherSchoolId)) {
    return c.json({ message: "Teacher not found" }, 404);
  }

  const cleanup = await detachUserDependencies(db, teacherId);
  if (!cleanup.ok) {
    return c.json({ message: cleanup.message }, 400);
  }

  await db.query("DELETE FROM users WHERE id = $1", [teacherId]);

  return c.json({ message: "Teacher removed" });
});


export default router;
