import { Hono } from "hono";
import type { AppEnv } from "../types/env";
import type { DbConnection } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { isFeatureEnabled } from "../utils/featureFlags";
import { toCsv } from "../utils/csv";

const router = new Hono<AppEnv>();

const TEACHER_ONLY = requireRole("teacher");

// `SELECT 1 ...` existence checks — only .length is ever read.
interface ExistsRow {
  [column: string]: unknown;
}

interface IdRow {
  id: number;
}

const ownsClass = async (db: DbConnection, teacherId: number, classId: number): Promise<boolean> => {
  const { rows } = await db.query<ExistsRow>("SELECT 1 FROM teacher_classes WHERE teacher_id = $1 AND class_id = $2", [
    teacherId,
    classId
  ]);
  return rows.length > 0;
};

/* ============================================================
   GET CLASSES FOR TEACHER
   ============================================================ */
interface ClassRow {
  id: number;
  class_name: string | null;
  year_group: string | null;
}

router.get("/classes", authMiddleware, TEACHER_ONLY, async c => {
  const db = c.get("db");
  const teacherId = c.get("user")!.userId;

  const { rows } = await db.query<ClassRow>(
    `SELECT c.id, c.class_name, c.year_group
     FROM classes c
     JOIN teacher_classes tc ON tc.class_id = c.id
     WHERE tc.teacher_id = $1`,
    [teacherId]
  );

  return c.json({ classes: rows });
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayStr = () => new Date().toISOString().slice(0, 10);

/* ============================================================
   DOWNLOAD ATTENDANCE REPORT (CSV) FOR ONE OF THE TEACHER'S CLASSES
   Always limited to the last 365 days — teachers cannot request an
   older range. Registered before /attendance/:classId so "report"
   isn't swallowed as a classId.
   ============================================================ */
interface AttendanceReportRow {
  date: string;
  first_name: string | null;
  surname: string | null;
  class_name: string | null;
  status: string;
}

router.get("/attendance/report", authMiddleware, TEACHER_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  if (!(await isFeatureEnabled(db, "attendance_report", user.schoolId))) {
    return c.json({ message: "The attendance report feature is currently disabled" }, 403);
  }

  const classId = Number(c.req.query("classId"));
  if (!classId) {
    return c.json({ message: "classId is required" }, 400);
  }

  if (!(await ownsClass(db, user.userId, classId))) {
    return c.json({ message: "You are not assigned to this class" }, 403);
  }

  const endDate = todayStr();
  const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { rows } = await db.query<AttendanceReportRow>(
    `SELECT
       TO_CHAR(a.date, 'YYYY-MM-DD') AS date,
       s.first_name,
       s.surname,
       c.class_name,
       a.status
     FROM attendance a
     JOIN students s ON s.id = a.student_id
     JOIN classes c ON c.id = a.class_id
     WHERE a.class_id = $1 AND a.date BETWEEN $2 AND $3
     ORDER BY a.date ASC, s.first_name ASC, s.surname ASC`,
    [classId, startDate, endDate]
  );

  const csv = toCsv(
    ["Date", "First Name", "Last Name", "Class", "Attendance"],
    rows.map(r => [
      r.date,
      r.first_name,
      r.surname,
      r.class_name,
      r.status === "PRESENT" ? "Present" : "Absent"
    ])
  );

  return c.text(csv, 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="attendance_report_class${classId}_${startDate}_to_${endDate}.csv"`
  });
});

/* ============================================================
   GET ATTENDANCE REGISTER FOR A CLASS ON A GIVEN DATE
   (defaults to today; pass ?date=YYYY-MM-DD to view/edit a past day)
   ============================================================ */
interface AttendanceRegisterRow {
  id: number;
  first_name: string | null;
  surname: string | null;
  attendance_status: string | null;
}

router.get("/attendance/:classId", authMiddleware, TEACHER_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = Number(c.req.param("classId"));
  const dateParam = c.req.query("date");

  if (typeof dateParam === "string" && dateParam && !DATE_RE.test(dateParam)) {
    return c.json({ message: "Invalid date format, expected YYYY-MM-DD" }, 400);
  }

  const date = typeof dateParam === "string" && dateParam ? dateParam : todayStr();

  if (!(await ownsClass(db, user.userId, classId))) {
    return c.json({ message: "You are not assigned to this class" }, 403);
  }

  const { rows } = await db.query<AttendanceRegisterRow>(
    `SELECT
       s.id,
       s.first_name,
       s.surname,
       a.status AS attendance_status
     FROM students s
     JOIN student_classes sc ON sc.student_id = s.id
     LEFT JOIN attendance a
       ON a.student_id = s.id
      AND a.class_id = $1
      AND a.date = $2
     WHERE sc.class_id = $3
     ORDER BY s.first_name, s.surname`,
    [classId, date, classId]
  );

  return c.json({ students: rows, date });
});

/* ============================================================
   GET ATTENDANCE HISTORY (PAST DATES) FOR A CLASS
   ============================================================ */
// Postgres returns SUM(...)/COUNT(*) as strings in the driver's default row
// mode, not numbers.
interface AttendanceHistoryRow {
  date: string;
  present_count: string;
  absent_count: string;
  total_count: string;
}

router.get("/attendance/:classId/history", authMiddleware, TEACHER_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = Number(c.req.param("classId"));

  if (!(await ownsClass(db, user.userId, classId))) {
    return c.json({ message: "You are not assigned to this class" }, 403);
  }

  const { rows } = await db.query<AttendanceHistoryRow>(
    `SELECT
       TO_CHAR(a.date, 'YYYY-MM-DD') AS date,
       SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present_count,
       SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_count,
       COUNT(*) AS total_count
     FROM attendance a
     WHERE a.class_id = $1
     GROUP BY a.date
     ORDER BY a.date DESC`,
    [classId]
  );

  return c.json({ history: rows });
});

/* ============================================================
   MARK ATTENDANCE (defaults to today; pass date to backfill a past day)
   ============================================================ */
router.post("/attendance/mark", authMiddleware, TEACHER_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const { classId, studentId, status, date: dateParam } = await c.req.json();

  if (!classId || !studentId || !status) {
    return c.json({ message: "classId, studentId and status are required" }, 400);
  }

  const normalizedStatus = String(status).toUpperCase();
  if (!["PRESENT", "ABSENT"].includes(normalizedStatus)) {
    return c.json({ message: "Status must be present or absent" }, 400);
  }

  if (dateParam && !DATE_RE.test(String(dateParam))) {
    return c.json({ message: "Invalid date format, expected YYYY-MM-DD" }, 400);
  }

  const date = dateParam || todayStr();

  if (!(await ownsClass(db, user.userId, Number(classId)))) {
    return c.json({ message: "You are not assigned to this class" }, 403);
  }

  await db.query(
    `INSERT INTO attendance (class_id, student_id, date, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (class_id, student_id, date) DO UPDATE SET status = EXCLUDED.status`,
    [classId, studentId, date, normalizedStatus]
  );

  return c.json({ message: "Attendance updated", date });
});

/* ============================================================
   CREATE TASK
   Pass studentId to set "independent homework" for just that one student
   instead of the whole class — gated by the student_notes flag since it
   lives on the same attendance-page panel as student notes.
   ============================================================ */
router.post("/tasks/create", authMiddleware, TEACHER_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const { classId, title, description, due_date, studentId } = await c.req.json();

  if (!(await ownsClass(db, user.userId, Number(classId)))) {
    return c.json({ message: "You are not assigned to this class" }, 403);
  }

  let resolvedStudentId: number | null = null;
  if (studentId) {
    if (!(await isFeatureEnabled(db, "student_notes", user.schoolId))) {
      return c.json({ message: "Independent homework is currently disabled" }, 403);
    }

    const { rows: studentRows } = await db.query<ExistsRow>(
      "SELECT 1 FROM student_classes WHERE class_id = $1 AND student_id = $2",
      [classId, studentId]
    );
    if (studentRows.length === 0) {
      return c.json({ message: "Student is not in this class" }, 400);
    }
    resolvedStudentId = Number(studentId);
  }

  await db.query(
    `INSERT INTO tasks (class_id, student_id, title, description, due_date)
     VALUES ($1, $2, $3, $4, $5)`,
    [classId, resolvedStudentId, title, description, due_date]
  );

  return c.json({ message: "Task created" });
});

/* ============================================================
   DELETE TASK (NEW)
   ============================================================ */
router.delete("/tasks/:id", authMiddleware, TEACHER_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const taskId = c.req.param("id");

  const { rows } = await db.query<IdRow>(
    `SELECT t.id
     FROM tasks t
     JOIN teacher_classes tc ON tc.class_id = t.class_id
     WHERE t.id = $1 AND tc.teacher_id = $2`,
    [taskId, user.userId]
  );

  if (rows.length === 0) {
    return c.json({ message: "You are not assigned to this task's class" }, 403);
  }

  await db.query("DELETE FROM tasks WHERE id = $1", [taskId]);

  return c.json({ message: "Task deleted" });
});

// One insert per parent-contact view so who looked at a student's parent
// details, and when, stays reconstructable — this is PII being opened up
// to a role that couldn't see it before. Mirrors systemAdmin.ts's
// logFeatureFlagAudit: awaited inline, not fire-and-forget.
const logParentContactView = async (
  db: DbConnection,
  entry: {
    teacherUserId: number;
    studentId: number;
    classId: number;
    schoolId: number | null;
  }
) => {
  await db.query(
    `INSERT INTO parent_contact_view_log
       (teacher_user_id, student_id, class_id, school_id)
     VALUES ($1, $2, $3, $4)`,
    [entry.teacherUserId, entry.studentId, entry.classId, entry.schoolId]
  );
};

/* ============================================================
   GET PARENT CONTACT INFO FOR A STUDENT IN ONE OF THE TEACHER'S CLASSES
   Logs one row to parent_contact_view_log every time this is called.
   ============================================================ */
interface GuardianContactRow {
  first_name: string | null;
  middle_name: string | null;
  surname: string | null;
  relationship_to_student: string | null;
  contact_number: string | null;
  email: string | null;
}

router.get("/classes/:classId/students/:studentId/parent-contacts", authMiddleware, TEACHER_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = Number(c.req.param("classId"));
  const studentId = Number(c.req.param("studentId"));

  if (!(await ownsClass(db, user.userId, classId))) {
    return c.json({ message: "You are not assigned to this class" }, 403);
  }

  const { rows: studentRows } = await db.query<ExistsRow>(
    "SELECT 1 FROM student_classes WHERE class_id = $1 AND student_id = $2",
    [classId, studentId]
  );
  if (studentRows.length === 0) {
    return c.json({ message: "Student is not in this class" }, 400);
  }

  const { rows: guardianRows } = await db.query<GuardianContactRow>(
    `SELECT
       p.first_name,
       p.middle_name,
       p.surname,
       p.relationship_to_student,
       p.contact_number,
       p.email
     FROM student_guardians sg
     JOIN parents p ON p.id = sg.parent_id
     WHERE sg.student_id = $1 AND sg.status = 'approved'`,
    [studentId]
  );

  await logParentContactView(db, {
    teacherUserId: user.userId,
    studentId,
    classId,
    schoolId: user.schoolId
  });

  return c.json({ guardians: guardianRows });
});

/* ============================================================
   GET TASKS FOR TEACHER
   ============================================================ */
interface TeacherTaskRow {
  id: number;
  title: string | null;
  description: string | null;
  due_date: Date | null;
  class_name: string | null;
  student_id: number | null;
  student_name: string | null;
}

router.get("/tasks", authMiddleware, TEACHER_ONLY, async c => {
  const db = c.get("db");
  const teacherId = c.get("user")!.userId;

  const { rows } = await db.query<TeacherTaskRow>(
    `SELECT
       t.id,
       t.title,
       t.description,
       t.due_date,
       c.class_name,
       t.student_id,
       CASE WHEN t.student_id IS NOT NULL
         THEN CONCAT(s.first_name, ' ', s.surname)
         ELSE NULL
       END AS student_name
     FROM tasks t
     JOIN classes c ON t.class_id = c.id
     JOIN teacher_classes tc ON tc.class_id = c.id
     LEFT JOIN students s ON s.id = t.student_id
     WHERE tc.teacher_id = $1`,
    [teacherId]
  );

  return c.json({ tasks: rows });
});

export default router;
