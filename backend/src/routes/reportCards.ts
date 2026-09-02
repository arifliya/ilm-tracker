import { Router } from "express";
import { pool } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/auth";
import { isFeatureEnabled } from "../utils/featureFlags";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../utils/httpError";

const router = Router();

// Deliberately narrower than the STAFF_MGMT-style groups elsewhere (which
// usually also include owner/system_admin): grades are only meant for the
// people directly involved in a student's day-to-day schooling and their
// parent, per the product decision behind this feature. Never the student.
const VIEW_ROLES = requireRole("admin", "teacher", "parent");
const AUTHOR_ROLES = requireRole("admin", "teacher");
const ADMIN_ONLY = requireRole("admin");

const isNonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

const loadStudent = async (studentId: number) => {
  const [rows] = await pool.query(
    "SELECT id, school_id FROM students WHERE id = ?",
    [studentId]
  );
  return (rows as any[])[0] || null;
};

const isOwnChild = async (userId: number, studentId: number) => {
  const [rows] = await pool.query(
    `SELECT 1 FROM student_guardians sg
     JOIN parents p ON p.id = sg.parent_id
     WHERE sg.student_id = ? AND p.user_id = ? AND sg.status = 'approved'`,
    [studentId, userId]
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

// Read access: staff (admin/teacher) at the student's school, scoped further
// for teachers to only students they actually teach; or the student's own
// parent. Same shape as notes.ts's access check.
const canView = async (req: AuthenticatedRequest, student: { id: number; school_id: number }) => {
  const role = req.user!.role;
  if (role === "admin") return req.user!.schoolId === student.school_id;
  if (role === "teacher") {
    return req.user!.schoolId === student.school_id && (await teachesStudent(req.user!.userId, student.id));
  }
  if (role === "parent") return isOwnChild(req.user!.userId, student.id);
  return false;
};

// Write access is the same as read access minus parent — parents are
// view-only.
const canAuthor = async (req: AuthenticatedRequest, student: { id: number; school_id: number }) => {
  const role = req.user!.role;
  if (role === "admin") return req.user!.schoolId === student.school_id;
  if (role === "teacher") {
    return req.user!.schoolId === student.school_id && (await teachesStudent(req.user!.userId, student.id));
  }
  return false;
};

const loadReportCard = async (reportCardId: number) => {
  const [rows] = await pool.query(
    `SELECT rc.id, rc.student_id, s.school_id
     FROM report_cards rc
     JOIN students s ON s.id = rc.student_id
     WHERE rc.id = ?`,
    [reportCardId]
  );
  return (rows as any[])[0] || null;
};

const validateSubjects = (subjects: unknown): string | null => {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return "At least one subject is required";
  }
  for (const s of subjects) {
    if (!s || !isNonEmpty(s.subject_name) || !isNonEmpty(s.grade)) {
      return "Each subject requires a subject_name and a grade";
    }
  }
  return null;
};

/* ============================================================
   LIST TERMS FOR THE CALLER'S SCHOOL — ADMIN, TEACHER
   Teachers need this to pick a term when creating a report card; admin
   also uses it to manage the term catalog.
   ============================================================ */
router.get(
  "/terms",
  authMiddleware,
  AUTHOR_ROLES,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const [rows] = await pool.query(
      "SELECT id, name, start_date, end_date FROM school_terms WHERE school_id = ? ORDER BY start_date DESC",
      [req.user!.schoolId]
    );
    res.json({ terms: rows });
  })
);

/* ============================================================
   CREATE A TERM — ADMIN ONLY
   ============================================================ */
router.post(
  "/terms",
  authMiddleware,
  ADMIN_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { name, start_date, end_date } = req.body;
    if (!isNonEmpty(name)) return res.status(400).json({ message: "Term name is required" });
    if (!isNonEmpty(start_date) || !isNonEmpty(end_date)) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }
    if (String(end_date) < String(start_date)) {
      return res.status(400).json({ message: "End date must be on or after the start date" });
    }

    let result;
    try {
      [result] = await pool.query(
        "INSERT INTO school_terms (school_id, name, start_date, end_date) VALUES (?, ?, ?, ?)",
        [req.user!.schoolId, String(name).trim(), start_date, end_date]
      );
    } catch (err: any) {
      if (err?.code === "ER_DUP_ENTRY") {
        throw new HttpError(409, "A term with this name already exists");
      }
      throw err;
    }

    res.status(201).json({
      message: "Term created",
      term: { id: (result as any).insertId, name: String(name).trim(), start_date, end_date }
    });
  })
);

/* ============================================================
   LIST A STUDENT'S REPORT CARDS — ADMIN, TEACHER, PARENT
   ============================================================ */
router.get(
  "/students/:studentId",
  authMiddleware,
  VIEW_ROLES,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const studentId = Number(req.params.studentId);
    const student = await loadStudent(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    if (!(await isFeatureEnabled("report_cards", student.school_id))) {
      return res.status(403).json({ message: "Report cards are currently disabled for this school" });
    }

    if (!(await canView(req, { ...student, id: studentId }))) {
      return res.status(403).json({ message: "You do not have access to this student's report cards" });
    }

    const [cards] = await pool.query(
      `SELECT rc.id, rc.term_id, rc.created_at, rc.updated_at,
              t.name AS term_name, t.start_date AS term_start_date, t.end_date AS term_end_date
       FROM report_cards rc
       JOIN school_terms t ON t.id = rc.term_id
       WHERE rc.student_id = ?
       ORDER BY t.start_date DESC`,
      [studentId]
    );

    const cardRows = cards as any[];
    if (cardRows.length === 0) return res.json({ reportCards: [] });

    const [subjectRows] = await pool.query(
      `SELECT id, report_card_id, subject_name, grade, comment
       FROM report_card_subjects
       WHERE report_card_id IN (?)
       ORDER BY subject_name ASC`,
      [cardRows.map(c => c.id)]
    );

    const subjectsByCard = new Map<number, any[]>();
    (subjectRows as any[]).forEach(s => {
      const list = subjectsByCard.get(s.report_card_id) || [];
      list.push({ id: s.id, subject_name: s.subject_name, grade: s.grade, comment: s.comment });
      subjectsByCard.set(s.report_card_id, list);
    });

    res.json({
      reportCards: cardRows.map(c => ({
        id: c.id,
        term_id: c.term_id,
        term_name: c.term_name,
        term_start_date: c.term_start_date,
        term_end_date: c.term_end_date,
        created_at: c.created_at,
        updated_at: c.updated_at,
        subjects: subjectsByCard.get(c.id) || []
      }))
    });
  })
);

/* ============================================================
   CREATE A REPORT CARD FOR A STUDENT — ADMIN, TEACHER
   One per student per term — use PUT to edit an existing one.
   ============================================================ */
router.post(
  "/students/:studentId",
  authMiddleware,
  AUTHOR_ROLES,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const studentId = Number(req.params.studentId);
    const { term_id, subjects } = req.body;

    const student = await loadStudent(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    if (!(await isFeatureEnabled("report_cards", student.school_id))) {
      return res.status(403).json({ message: "Report cards are currently disabled for this school" });
    }

    if (!(await canAuthor(req, { id: studentId, school_id: student.school_id }))) {
      return res.status(403).json({ message: "You do not have access to this student" });
    }

    if (!term_id) return res.status(400).json({ message: "term_id is required" });

    const subjectsError = validateSubjects(subjects);
    if (subjectsError) return res.status(400).json({ message: subjectsError });

    const [termRows] = await pool.query(
      "SELECT id FROM school_terms WHERE id = ? AND school_id = ?",
      [term_id, student.school_id]
    );
    if ((termRows as any[]).length === 0) {
      return res.status(400).json({ message: "Unknown term for this school" });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        "INSERT INTO report_cards (student_id, term_id, created_by_user_id) VALUES (?, ?, ?)",
        [studentId, term_id, req.user!.userId]
      );
      const reportCardId = (result as any).insertId;

      const values = subjects.map((s: any) => [reportCardId, String(s.subject_name).trim(), String(s.grade).trim(), s.comment ? String(s.comment).trim() : null]);
      await conn.query(
        "INSERT INTO report_card_subjects (report_card_id, subject_name, grade, comment) VALUES ?",
        [values]
      );

      await conn.commit();
      res.status(201).json({ message: "Report card created", reportCard: { id: reportCardId } });
    } catch (err: any) {
      await conn.rollback();
      if (err?.code === "ER_DUP_ENTRY") {
        throw new HttpError(409, "A report card already exists for this student and term. Edit it instead.");
      }
      throw err;
    } finally {
      conn.release();
    }
  })
);

/* ============================================================
   EDIT A REPORT CARD'S SUBJECTS — ADMIN, TEACHER
   Replaces the full subject list rather than patching individual rows.
   ============================================================ */
router.put(
  "/:id",
  authMiddleware,
  AUTHOR_ROLES,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const reportCardId = Number(req.params.id);
    const { subjects } = req.body;

    const card = await loadReportCard(reportCardId);
    if (!card) return res.status(404).json({ message: "Report card not found" });

    if (!(await isFeatureEnabled("report_cards", card.school_id))) {
      return res.status(403).json({ message: "Report cards are currently disabled for this school" });
    }

    if (!(await canAuthor(req, { id: card.student_id, school_id: card.school_id }))) {
      return res.status(403).json({ message: "You do not have access to this student" });
    }

    const subjectsError = validateSubjects(subjects);
    if (subjectsError) return res.status(400).json({ message: subjectsError });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query("DELETE FROM report_card_subjects WHERE report_card_id = ?", [reportCardId]);

      const values = subjects.map((s: any) => [reportCardId, String(s.subject_name).trim(), String(s.grade).trim(), s.comment ? String(s.comment).trim() : null]);
      await conn.query(
        "INSERT INTO report_card_subjects (report_card_id, subject_name, grade, comment) VALUES ?",
        [values]
      );

      await conn.query("UPDATE report_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [reportCardId]);

      await conn.commit();
      res.json({ message: "Report card updated" });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

/* ============================================================
   DELETE A REPORT CARD — ADMIN, TEACHER
   ============================================================ */
router.delete(
  "/:id",
  authMiddleware,
  AUTHOR_ROLES,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const reportCardId = Number(req.params.id);

    const card = await loadReportCard(reportCardId);
    if (!card) return res.status(404).json({ message: "Report card not found" });

    if (!(await isFeatureEnabled("report_cards", card.school_id))) {
      return res.status(403).json({ message: "Report cards are currently disabled for this school" });
    }

    if (!(await canAuthor(req, { id: card.student_id, school_id: card.school_id }))) {
      return res.status(403).json({ message: "You do not have access to this student" });
    }

    await pool.query("DELETE FROM report_cards WHERE id = ?", [reportCardId]);
    res.json({ message: "Report card deleted" });
  })
);

export default router;
