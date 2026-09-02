import { Router } from "express";
import { pool } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/auth";
import { isFeatureEnabled } from "../utils/featureFlags";
import { toCsv } from "../utils/csv";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const TEACHER_ONLY = requireRole("teacher");

const ownsClass = async (teacherId: number, classId: number) => {
  const [rows] = await pool.query(
    "SELECT 1 FROM teacher_classes WHERE teacher_id = ? AND class_id = ?",
    [teacherId, classId]
  );
  return (rows as any[]).length > 0;
};

/* ============================================================
   GET CLASSES FOR TEACHER
   ============================================================ */
router.get(
  "/classes",
  authMiddleware,
  TEACHER_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.userId;

    const [rows] = await pool.query(
      `SELECT c.id, c.class_name, c.year_group
       FROM classes c
       JOIN teacher_classes tc ON tc.class_id = c.id
       WHERE tc.teacher_id = ?`,
      [teacherId]
    );

    res.json({ classes: rows });
  })
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayStr = () => new Date().toISOString().slice(0, 10);

/* ============================================================
   DOWNLOAD ATTENDANCE REPORT (CSV) FOR ONE OF THE TEACHER'S CLASSES
   Always limited to the last 365 days — teachers cannot request an
   older range. Registered before /attendance/:classId so "report"
   isn't swallowed as a classId.
   ============================================================ */
router.get(
  "/attendance/report",
  authMiddleware,
  TEACHER_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!(await isFeatureEnabled("attendance_report", req.user!.schoolId))) {
      return res.status(403).json({ message: "The attendance report feature is currently disabled" });
    }

    const classId = Number(req.query.classId);
    if (!classId) {
      return res.status(400).json({ message: "classId is required" });
    }

    if (!(await ownsClass(req.user!.userId, classId))) {
      return res.status(403).json({ message: "You are not assigned to this class" });
    }

    const endDate = todayStr();
    const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(a.date, '%Y-%m-%d') AS date,
         s.first_name,
         s.surname,
         c.class_name,
         a.status
       FROM attendance a
       JOIN students s ON s.id = a.student_id
       JOIN classes c ON c.id = a.class_id
       WHERE a.class_id = ? AND a.date BETWEEN ? AND ?
       ORDER BY a.date ASC, s.first_name ASC, s.surname ASC`,
      [classId, startDate, endDate]
    );

    const csv = toCsv(
      ["Date", "First Name", "Last Name", "Class", "Attendance"],
      (rows as any[]).map(r => [
        r.date,
        r.first_name,
        r.surname,
        r.class_name,
        r.status === "PRESENT" ? "Present" : "Absent"
      ])
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="attendance_report_class${classId}_${startDate}_to_${endDate}.csv"`
    );
    res.send(csv);
  })
);

/* ============================================================
   GET ATTENDANCE REGISTER FOR A CLASS ON A GIVEN DATE
   (defaults to today; pass ?date=YYYY-MM-DD to view/edit a past day)
   ============================================================ */
router.get(
  "/attendance/:classId",
  authMiddleware,
  TEACHER_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const classId = Number(req.params.classId);
    const dateParam = req.query.date;

    if (typeof dateParam === "string" && dateParam && !DATE_RE.test(dateParam)) {
      return res.status(400).json({ message: "Invalid date format, expected YYYY-MM-DD" });
    }

    const date = typeof dateParam === "string" && dateParam ? dateParam : todayStr();

    if (!(await ownsClass(req.user!.userId, classId))) {
      return res.status(403).json({ message: "You are not assigned to this class" });
    }

    const [rows] = await pool.query(
      `SELECT
         s.id,
         s.first_name,
         s.surname,
         a.status AS attendance_status
       FROM students s
       JOIN student_classes sc ON sc.student_id = s.id
       LEFT JOIN attendance a
         ON a.student_id = s.id
        AND a.class_id = ?
        AND a.date = ?
       WHERE sc.class_id = ?
       ORDER BY s.first_name, s.surname`,
      [classId, date, classId]
    );

    res.json({ students: rows, date });
  })
);

/* ============================================================
   GET ATTENDANCE HISTORY (PAST DATES) FOR A CLASS
   ============================================================ */
router.get(
  "/attendance/:classId/history",
  authMiddleware,
  TEACHER_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const classId = Number(req.params.classId);

    if (!(await ownsClass(req.user!.userId, classId))) {
      return res.status(403).json({ message: "You are not assigned to this class" });
    }

    const [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(a.date, '%Y-%m-%d') AS date,
         SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present_count,
         SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_count,
         COUNT(*) AS total_count
       FROM attendance a
       WHERE a.class_id = ?
       GROUP BY a.date
       ORDER BY a.date DESC`,
      [classId]
    );

    res.json({ history: rows });
  })
);

/* ============================================================
   MARK ATTENDANCE (defaults to today; pass date to backfill a past day)
   ============================================================ */
router.post(
  "/attendance/mark",
  authMiddleware,
  TEACHER_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { classId, studentId, status, date: dateParam } = req.body;

    if (!classId || !studentId || !status) {
      return res.status(400).json({ message: "classId, studentId and status are required" });
    }

    const normalizedStatus = String(status).toUpperCase();
    if (!["PRESENT", "ABSENT"].includes(normalizedStatus)) {
      return res.status(400).json({ message: "Status must be present or absent" });
    }

    if (dateParam && !DATE_RE.test(String(dateParam))) {
      return res.status(400).json({ message: "Invalid date format, expected YYYY-MM-DD" });
    }

    const date = dateParam || todayStr();

    if (!(await ownsClass(req.user!.userId, Number(classId)))) {
      return res.status(403).json({ message: "You are not assigned to this class" });
    }

    await pool.query(
      `INSERT INTO attendance (class_id, student_id, date, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [classId, studentId, date, normalizedStatus]
    );

    res.json({ message: "Attendance updated", date });
  })
);

/* ============================================================
   CREATE TASK
   Pass studentId to set "independent homework" for just that one student
   instead of the whole class — gated by the student_notes flag since it
   lives on the same attendance-page panel as student notes.
   ============================================================ */
router.post(
  "/tasks/create",
  authMiddleware,
  TEACHER_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { classId, title, description, due_date, studentId } = req.body;

    if (!(await ownsClass(req.user!.userId, Number(classId)))) {
      return res.status(403).json({ message: "You are not assigned to this class" });
    }

    let resolvedStudentId: number | null = null;
    if (studentId) {
      if (!(await isFeatureEnabled("student_notes", req.user!.schoolId))) {
        return res.status(403).json({ message: "Independent homework is currently disabled" });
      }

      const [studentRows] = await pool.query(
        "SELECT 1 FROM student_classes WHERE class_id = ? AND student_id = ?",
        [classId, studentId]
      );
      if ((studentRows as any[]).length === 0) {
        return res.status(400).json({ message: "Student is not in this class" });
      }
      resolvedStudentId = Number(studentId);
    }

    await pool.query(
      `INSERT INTO tasks (class_id, student_id, title, description, due_date)
       VALUES (?, ?, ?, ?, ?)`,
      [classId, resolvedStudentId, title, description, due_date]
    );

    res.json({ message: "Task created" });
  })
);

/* ============================================================
   DELETE TASK (NEW)
   ============================================================ */
router.delete(
  "/tasks/:id",
  authMiddleware,
  TEACHER_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const taskId = req.params.id;

    const [rows] = await pool.query(
      `SELECT t.id
       FROM tasks t
       JOIN teacher_classes tc ON tc.class_id = t.class_id
       WHERE t.id = ? AND tc.teacher_id = ?`,
      [taskId, req.user!.userId]
    );

    if ((rows as any[]).length === 0) {
      return res.status(403).json({ message: "You are not assigned to this task's class" });
    }

    await pool.query("DELETE FROM tasks WHERE id = ?", [taskId]);

    res.json({ message: "Task deleted" });
  })
);

// One insert per parent-contact view so who looked at a student's parent
// details, and when, stays reconstructable — this is PII being opened up
// to a role that couldn't see it before. Mirrors systemAdmin.ts's
// logFeatureFlagAudit: awaited inline, not fire-and-forget.
const logParentContactView = async (entry: {
  teacherUserId: number;
  studentId: number;
  classId: number;
  schoolId: number | null;
}) => {
  await pool.query(
    `INSERT INTO parent_contact_view_log
       (teacher_user_id, student_id, class_id, school_id)
     VALUES (?, ?, ?, ?)`,
    [entry.teacherUserId, entry.studentId, entry.classId, entry.schoolId]
  );
};

/* ============================================================
   GET PARENT CONTACT INFO FOR A STUDENT IN ONE OF THE TEACHER'S CLASSES
   Logs one row to parent_contact_view_log every time this is called.
   ============================================================ */
router.get(
  "/classes/:classId/students/:studentId/parent-contacts",
  authMiddleware,
  TEACHER_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const classId = Number(req.params.classId);
    const studentId = Number(req.params.studentId);

    if (!(await ownsClass(req.user!.userId, classId))) {
      return res.status(403).json({ message: "You are not assigned to this class" });
    }

    const [studentRows] = await pool.query(
      "SELECT 1 FROM student_classes WHERE class_id = ? AND student_id = ?",
      [classId, studentId]
    );
    if ((studentRows as any[]).length === 0) {
      return res.status(400).json({ message: "Student is not in this class" });
    }

    const [guardianRows] = await pool.query(
      `SELECT
         p.first_name,
         p.middle_name,
         p.surname,
         p.relationship_to_student,
         p.contact_number,
         p.email
       FROM student_guardians sg
       JOIN parents p ON p.id = sg.parent_id
       WHERE sg.student_id = ? AND sg.status = 'approved'`,
      [studentId]
    );

    await logParentContactView({
      teacherUserId: req.user!.userId,
      studentId,
      classId,
      schoolId: req.user!.schoolId
    });

    res.json({ guardians: guardianRows });
  })
);

/* ============================================================
   GET TASKS FOR TEACHER
   ============================================================ */
router.get(
  "/tasks",
  authMiddleware,
  TEACHER_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.userId;

    const [rows] = await pool.query(
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
       WHERE tc.teacher_id = ?`,
      [teacherId]
    );

    res.json({ tasks: rows });
  })
);

export default router;
