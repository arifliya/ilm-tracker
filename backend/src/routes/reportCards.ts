import { Hono } from "hono";
import type { AppEnv } from "../types/env";
import type { DbConnection } from "../config/db";
import type { JwtPayload } from "../types/auth";
import { authMiddleware, requireRole } from "../middleware/auth";
import { isFeatureEnabled } from "../utils/featureFlags";
import { HttpError } from "../utils/httpError";

const router = new Hono<AppEnv>();

// Every `SELECT id FROM ...`/`RETURNING id` in this file resolves to this
// same single-column shape.
interface IdRow {
  id: number;
}

// `SELECT 1 ...` existence checks — only .length is ever read, the actual
// (unnamed) column is never accessed.
interface ExistsRow {
  [column: string]: unknown;
}

interface StudentIdSchoolRow {
  id: number;
  school_id: number;
}

interface ReportCardStudentRow {
  id: number;
  student_id: number;
  school_id: number;
}

interface TermRow {
  id: number;
  name: string;
  start_date: Date;
  end_date: Date;
}

interface ReportCardListRow {
  id: number;
  term_id: number;
  created_at: Date;
  updated_at: Date;
  term_name: string;
  term_start_date: Date;
  term_end_date: Date;
}

interface ReportCardSubjectRow {
  id: number;
  report_card_id: number;
  subject_name: string;
  grade: string;
  comment: string | null;
}

interface SubjectSummary {
  id: number;
  subject_name: string;
  grade: string;
  comment: string | null;
}

// Deliberately narrower than the STAFF_MGMT-style groups elsewhere (which
// usually also include owner/system_admin): grades are only meant for the
// people directly involved in a student's day-to-day schooling and their
// parent, per the product decision behind this feature. Never the student.
const VIEW_ROLES = requireRole("admin", "teacher", "parent");
const AUTHOR_ROLES = requireRole("admin", "teacher");
const ADMIN_ONLY = requireRole("admin");

const isNonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

const loadStudent = async (db: DbConnection, studentId: number) => {
  const { rows } = await db.query<StudentIdSchoolRow>("SELECT id, school_id FROM students WHERE id = $1", [studentId]);
  return rows[0] || null;
};

const isOwnChild = async (db: DbConnection, userId: number, studentId: number) => {
  const { rows } = await db.query<ExistsRow>(
    `SELECT 1 FROM student_guardians sg
     JOIN parents p ON p.id = sg.parent_id
     WHERE sg.student_id = $1 AND p.user_id = $2 AND sg.status = 'approved'`,
    [studentId, userId]
  );
  return rows.length > 0;
};

const teachesStudent = async (db: DbConnection, teacherId: number, studentId: number) => {
  const { rows } = await db.query<ExistsRow>(
    `SELECT 1 FROM student_classes sc
     JOIN teacher_classes tc ON tc.class_id = sc.class_id
     WHERE sc.student_id = $1 AND tc.teacher_id = $2`,
    [studentId, teacherId]
  );
  return rows.length > 0;
};

// Read access: staff (admin/teacher) at the student's school, scoped further
// for teachers to only students they actually teach; or the student's own
// parent. Same shape as notes.ts's access check.
const canView = async (db: DbConnection, user: JwtPayload, student: { id: number; school_id: number }) => {
  const role = user.role;
  if (role === "admin") return user.schoolId === student.school_id;
  if (role === "teacher") {
    return user.schoolId === student.school_id && (await teachesStudent(db, user.userId, student.id));
  }
  if (role === "parent") return isOwnChild(db, user.userId, student.id);
  return false;
};

// Write access is the same as read access minus parent — parents are
// view-only.
const canAuthor = async (db: DbConnection, user: JwtPayload, student: { id: number; school_id: number }) => {
  const role = user.role;
  if (role === "admin") return user.schoolId === student.school_id;
  if (role === "teacher") {
    return user.schoolId === student.school_id && (await teachesStudent(db, user.userId, student.id));
  }
  return false;
};

const loadReportCard = async (db: DbConnection, reportCardId: number) => {
  const { rows } = await db.query<ReportCardStudentRow>(
    `SELECT rc.id, rc.student_id, s.school_id
     FROM report_cards rc
     JOIN students s ON s.id = rc.student_id
     WHERE rc.id = $1`,
    [reportCardId]
  );
  return rows[0] || null;
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
router.get("/terms", authMiddleware, AUTHOR_ROLES, async c => {
  const db = c.get("db");
  const { rows } = await db.query<TermRow>(
    "SELECT id, name, start_date, end_date FROM school_terms WHERE school_id = $1 ORDER BY start_date DESC",
    [c.get("user")!.schoolId]
  );
  return c.json({ terms: rows });
});

/* ============================================================
   CREATE A TERM — ADMIN ONLY
   ============================================================ */
router.post("/terms", authMiddleware, ADMIN_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const { name, start_date, end_date } = await c.req.json();
  if (!isNonEmpty(name)) return c.json({ message: "Term name is required" }, 400);
  if (!isNonEmpty(start_date) || !isNonEmpty(end_date)) {
    return c.json({ message: "Start date and end date are required" }, 400);
  }
  if (String(end_date) < String(start_date)) {
    return c.json({ message: "End date must be on or after the start date" }, 400);
  }

  let result: IdRow;
  try {
    ({
      rows: [result]
    } = await db.query<IdRow>(
      "INSERT INTO school_terms (school_id, name, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING id",
      [user.schoolId, String(name).trim(), start_date, end_date]
    ));
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new HttpError(409, "A term with this name already exists");
    }
    throw err;
  }

  return c.json(
    {
      message: "Term created",
      term: { id: result.id, name: String(name).trim(), start_date, end_date }
    },
    201
  );
});

/* ============================================================
   LIST A STUDENT'S REPORT CARDS — ADMIN, TEACHER, PARENT
   ============================================================ */
router.get("/students/:studentId", authMiddleware, VIEW_ROLES, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const studentId = Number(c.req.param("studentId"));
  const student = await loadStudent(db, studentId);
  if (!student) return c.json({ message: "Student not found" }, 404);

  if (!(await isFeatureEnabled(db, "report_cards", student.school_id))) {
    return c.json({ message: "Report cards are currently disabled for this school" }, 403);
  }

  if (!(await canView(db, user, { ...student, id: studentId }))) {
    return c.json({ message: "You do not have access to this student's report cards" }, 403);
  }

  const { rows: cards } = await db.query<ReportCardListRow>(
    `SELECT rc.id, rc.term_id, rc.created_at, rc.updated_at,
            t.name AS term_name, t.start_date AS term_start_date, t.end_date AS term_end_date
     FROM report_cards rc
     JOIN school_terms t ON t.id = rc.term_id
     WHERE rc.student_id = $1
     ORDER BY t.start_date DESC`,
    [studentId]
  );

  const cardRows = cards;
  if (cardRows.length === 0) return c.json({ reportCards: [] });

  const { rows: subjectRows } = await db.query<ReportCardSubjectRow>(
    `SELECT id, report_card_id, subject_name, grade, comment
     FROM report_card_subjects
     WHERE report_card_id = ANY($1)
     ORDER BY subject_name ASC`,
    [cardRows.map(cr => cr.id)]
  );

  const subjectsByCard = new Map<number, SubjectSummary[]>();
  subjectRows.forEach(s => {
    const list = subjectsByCard.get(s.report_card_id) || [];
    list.push({ id: s.id, subject_name: s.subject_name, grade: s.grade, comment: s.comment });
    subjectsByCard.set(s.report_card_id, list);
  });

  return c.json({
    reportCards: cardRows.map(cr => ({
      id: cr.id,
      term_id: cr.term_id,
      term_name: cr.term_name,
      term_start_date: cr.term_start_date,
      term_end_date: cr.term_end_date,
      created_at: cr.created_at,
      updated_at: cr.updated_at,
      subjects: subjectsByCard.get(cr.id) || []
    }))
  });
});

/* ============================================================
   CREATE A REPORT CARD FOR A STUDENT — ADMIN, TEACHER
   One per student per term — use PUT to edit an existing one.
   ============================================================ */
router.post("/students/:studentId", authMiddleware, AUTHOR_ROLES, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const studentId = Number(c.req.param("studentId"));
  const { term_id, subjects } = await c.req.json();

  const student = await loadStudent(db, studentId);
  if (!student) return c.json({ message: "Student not found" }, 404);

  if (!(await isFeatureEnabled(db, "report_cards", student.school_id))) {
    return c.json({ message: "Report cards are currently disabled for this school" }, 403);
  }

  if (!(await canAuthor(db, user, { id: studentId, school_id: student.school_id }))) {
    return c.json({ message: "You do not have access to this student" }, 403);
  }

  if (!term_id) return c.json({ message: "term_id is required" }, 400);

  const subjectsError = validateSubjects(subjects);
  if (subjectsError) return c.json({ message: subjectsError }, 400);

  const { rows: termRows } = await db.query<IdRow>("SELECT id FROM school_terms WHERE id = $1 AND school_id = $2", [
    term_id,
    student.school_id
  ]);
  if (termRows.length === 0) {
    return c.json({ message: "Unknown term for this school" }, 400);
  }

  try {
    await db.query("BEGIN");

    const {
      rows: [result]
    } = await db.query<IdRow>(
      "INSERT INTO report_cards (student_id, term_id, created_by_user_id) VALUES ($1, $2, $3) RETURNING id",
      [studentId, term_id, user.userId]
    );
    const reportCardId = result.id;

    const values = subjects.map((s: any) => [
      reportCardId,
      String(s.subject_name).trim(),
      String(s.grade).trim(),
      s.comment ? String(s.comment).trim() : null
    ]);
    const groups = values.map((_: any, i: number) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(", ");
    const flatParams = values.flat();
    await db.query(
      `INSERT INTO report_card_subjects (report_card_id, subject_name, grade, comment) VALUES ${groups}`,
      flatParams
    );

    await db.query("COMMIT");
    return c.json({ message: "Report card created", reportCard: { id: reportCardId } }, 201);
  } catch (err: any) {
    await db.query("ROLLBACK");
    if (err?.code === "23505") {
      throw new HttpError(409, "A report card already exists for this student and term. Edit it instead.");
    }
    throw err;
  }
});

/* ============================================================
   EDIT A REPORT CARD'S SUBJECTS — ADMIN, TEACHER
   Replaces the full subject list rather than patching individual rows.
   ============================================================ */
router.put("/:id", authMiddleware, AUTHOR_ROLES, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const reportCardId = Number(c.req.param("id"));
  const { subjects } = await c.req.json();

  const card = await loadReportCard(db, reportCardId);
  if (!card) return c.json({ message: "Report card not found" }, 404);

  if (!(await isFeatureEnabled(db, "report_cards", card.school_id))) {
    return c.json({ message: "Report cards are currently disabled for this school" }, 403);
  }

  if (!(await canAuthor(db, user, { id: card.student_id, school_id: card.school_id }))) {
    return c.json({ message: "You do not have access to this student" }, 403);
  }

  const subjectsError = validateSubjects(subjects);
  if (subjectsError) return c.json({ message: subjectsError }, 400);

  try {
    await db.query("BEGIN");

    await db.query("DELETE FROM report_card_subjects WHERE report_card_id = $1", [reportCardId]);

    const values = subjects.map((s: any) => [
      reportCardId,
      String(s.subject_name).trim(),
      String(s.grade).trim(),
      s.comment ? String(s.comment).trim() : null
    ]);
    const groups = values.map((_: any, i: number) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(", ");
    const flatParams = values.flat();
    await db.query(
      `INSERT INTO report_card_subjects (report_card_id, subject_name, grade, comment) VALUES ${groups}`,
      flatParams
    );

    await db.query("UPDATE report_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [reportCardId]);

    await db.query("COMMIT");
    return c.json({ message: "Report card updated" });
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
});

/* ============================================================
   DELETE A REPORT CARD — ADMIN, TEACHER
   ============================================================ */
router.delete("/:id", authMiddleware, AUTHOR_ROLES, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const reportCardId = Number(c.req.param("id"));

  const card = await loadReportCard(db, reportCardId);
  if (!card) return c.json({ message: "Report card not found" }, 404);

  if (!(await isFeatureEnabled(db, "report_cards", card.school_id))) {
    return c.json({ message: "Report cards are currently disabled for this school" }, 403);
  }

  if (!(await canAuthor(db, user, { id: card.student_id, school_id: card.school_id }))) {
    return c.json({ message: "You do not have access to this student" }, 403);
  }

  await db.query("DELETE FROM report_cards WHERE id = $1", [reportCardId]);
  return c.json({ message: "Report card deleted" });
});

export default router;
