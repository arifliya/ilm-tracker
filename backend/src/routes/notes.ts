import { Hono } from "hono";
import type { AppEnv } from "../types/env";
import type { DbConnection } from "../config/db";
import { authMiddleware } from "../middleware/auth";
import { isFeatureEnabled } from "../utils/featureFlags";

const router = new Hono<AppEnv>();

// Same "staff" grouping notifications uses for its staff audience — everyone
// who works at the school. Parents get access separately below, scoped to
// their own children only. Students and system_admin are deliberately
// excluded: these notes are about a student, not for them, and system_admin
// has no single school to be "staff" in.
const STAFF_ROLES = ["teacher", "staff", "admin", "owner", "maintainer", "treasurer"];

interface StudentRow {
  id: number;
  school_id: number;
}

// `SELECT 1 ...` existence checks — only .length is ever read.
interface ExistsRow {
  [column: string]: unknown;
}

const loadStudent = async (db: DbConnection, studentId: number): Promise<StudentRow | null> => {
  const { rows } = await db.query<StudentRow>("SELECT id, school_id FROM students WHERE id = $1", [studentId]);
  return rows[0] || null;
};

const isOwnChild = async (db: DbConnection, userId: number, studentId: number): Promise<boolean> => {
  const { rows } = await db.query<ExistsRow>(
    `SELECT 1 FROM student_guardians sg
     JOIN parents p ON p.id = sg.parent_id
     WHERE sg.student_id = $1 AND p.user_id = $2 AND sg.status = 'approved'`,
    [studentId, userId]
  );
  return rows.length > 0;
};

const teachesStudent = async (db: DbConnection, teacherId: number, studentId: number): Promise<boolean> => {
  const { rows } = await db.query<ExistsRow>(
    `SELECT 1 FROM student_classes sc
     JOIN teacher_classes tc ON tc.class_id = sc.class_id
     WHERE sc.student_id = $1 AND tc.teacher_id = $2`,
    [studentId, teacherId]
  );
  return rows.length > 0;
};

/* ============================================================
   GET NOTES FOR A STUDENT
   Staff (same school) or the student's own parent. Never the student.
   ============================================================ */
interface NoteRow {
  id: number;
  note: string;
  created_at: Date;
  author_first_name: string;
  author_last_name: string;
}

router.get("/students/:studentId", authMiddleware, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const studentId = Number(c.req.param("studentId"));
  const student = await loadStudent(db, studentId);
  if (!student) return c.json({ message: "Student not found" }, 404);

  if (!(await isFeatureEnabled(db, "student_notes", student.school_id))) {
    return c.json({ message: "Student notes are currently disabled for this school" }, 403);
  }

  const role = user.role;
  const allowed = STAFF_ROLES.includes(role)
    ? user.schoolId === student.school_id
    : role === "parent"
      ? await isOwnChild(db, user.userId, student.id)
      : false;

  if (!allowed) {
    return c.json({ message: "You do not have access to this student's notes" }, 403);
  }

  const { rows } = await db.query<NoteRow>(
    `SELECT
       n.id,
       n.note,
       n.created_at,
       COALESCE(sd.first_name, '') AS author_first_name,
       COALESCE(sd.surname, '') AS author_last_name
     FROM student_notes n
     LEFT JOIN staff_details sd ON sd.user_id = n.author_user_id
     WHERE n.student_id = $1
     ORDER BY n.created_at DESC`,
    [studentId]
  );

  return c.json({ notes: rows });
});

/* ============================================================
   ADD A NOTE FOR A STUDENT — STAFF ONLY
   Teachers are further restricted to students in one of their own classes,
   matching this feature's entry point on the attendance page.
   ============================================================ */
router.post("/students/:studentId", authMiddleware, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const role = user.role;
  if (!STAFF_ROLES.includes(role)) {
    return c.json({ message: "Forbidden" }, 403);
  }

  const studentId = Number(c.req.param("studentId"));
  const { note } = await c.req.json();
  if (!note || !String(note).trim()) {
    return c.json({ message: "Note text is required" }, 400);
  }

  const student = await loadStudent(db, studentId);
  if (!student) return c.json({ message: "Student not found" }, 404);

  if (!(await isFeatureEnabled(db, "student_notes", student.school_id))) {
    return c.json({ message: "Student notes are currently disabled for this school" }, 403);
  }

  if (student.school_id !== user.schoolId) {
    return c.json({ message: "You do not have access to this student" }, 403);
  }

  if (role === "teacher" && !(await teachesStudent(db, user.userId, studentId))) {
    return c.json({ message: "You are not assigned to this student's class" }, 403);
  }

  await db.query(`INSERT INTO student_notes (student_id, author_user_id, note) VALUES ($1, $2, $3)`, [
    studentId,
    user.userId,
    String(note).trim()
  ]);

  return c.json({ message: "Note added" }, 201);
});

export default router;
