import { Router } from "express";
import { pool } from "../config/db";
import { authMiddleware } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/auth";
import { isFeatureEnabled } from "../utils/featureFlags";

const router = Router();

// Same "staff" grouping notifications uses for its staff audience — everyone
// who works at the school. Parents get access separately below, scoped to
// their own children only. Students and system_admin are deliberately
// excluded: these notes are about a student, not for them, and system_admin
// has no single school to be "staff" in.
const STAFF_ROLES = ["teacher", "staff", "admin", "owner", "maintainer"];

const loadStudent = async (studentId: number) => {
  const [rows] = await pool.query(
    "SELECT id, school_id, parent_id FROM students WHERE id = ?",
    [studentId]
  );
  return (rows as any[])[0] || null;
};

const isOwnChild = async (userId: number, parentId: number) => {
  const [rows] = await pool.query(
    "SELECT 1 FROM parents WHERE id = ? AND user_id = ?",
    [parentId, userId]
  );
  return (rows as any[]).length > 0;
};

const teachesStudent = async (teacherId: number, studentId: number) => {
  const [rows] = await pool.query(
    `SELECT 1 FROM student_classes sc
     JOIN teacher_classes tc ON tc.class_id = sc.class_id
     WHERE sc.student_id = ? AND tc.teacher_id = ?`,
    [studentId, teacherId]
  );
  return (rows as any[]).length > 0;
};

/* ============================================================
   GET NOTES FOR A STUDENT
   Staff (same school) or the student's own parent. Never the student.
   ============================================================ */
router.get("/students/:studentId", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const student = await loadStudent(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    if (!(await isFeatureEnabled("student_notes", student.school_id))) {
      return res.status(403).json({ message: "Student notes are currently disabled for this school" });
    }

    const role = req.user!.role;
    const allowed = STAFF_ROLES.includes(role)
      ? req.user!.schoolId === student.school_id
      : role === "parent"
      ? await isOwnChild(req.user!.userId, student.parent_id)
      : false;

    if (!allowed) {
      return res.status(403).json({ message: "You do not have access to this student's notes" });
    }

    const [rows] = await pool.query(
      `SELECT
         n.id,
         n.note,
         n.created_at,
         COALESCE(sd.first_name, '') AS author_first_name,
         COALESCE(sd.surname, '') AS author_last_name
       FROM student_notes n
       LEFT JOIN staff_details sd ON sd.user_id = n.author_user_id
       WHERE n.student_id = ?
       ORDER BY n.created_at DESC`,
      [studentId]
    );

    res.json({ notes: rows });
  } catch (err) {
    console.error("Load student notes error:", err);
    res.status(500).json({ message: "Failed to load notes" });
  }
});

/* ============================================================
   ADD A NOTE FOR A STUDENT — STAFF ONLY
   Teachers are further restricted to students in one of their own classes,
   matching this feature's entry point on the attendance page.
   ============================================================ */
router.post("/students/:studentId", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const role = req.user!.role;
    if (!STAFF_ROLES.includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const studentId = Number(req.params.studentId);
    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ message: "Note text is required" });
    }

    const student = await loadStudent(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    if (!(await isFeatureEnabled("student_notes", student.school_id))) {
      return res.status(403).json({ message: "Student notes are currently disabled for this school" });
    }

    if (student.school_id !== req.user!.schoolId) {
      return res.status(403).json({ message: "You do not have access to this student" });
    }

    if (role === "teacher" && !(await teachesStudent(req.user!.userId, studentId))) {
      return res.status(403).json({ message: "You are not assigned to this student's class" });
    }

    await pool.query(
      `INSERT INTO student_notes (student_id, author_user_id, note) VALUES (?, ?, ?)`,
      [studentId, req.user!.userId, String(note).trim()]
    );

    res.status(201).json({ message: "Note added" });
  } catch (err) {
    console.error("Add student note error:", err);
    res.status(500).json({ message: "Failed to add note" });
  }
});

export default router;
