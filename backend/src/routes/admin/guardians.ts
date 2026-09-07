import { Hono } from "hono";
import type { AppEnv } from "../../types/env";
import { authMiddleware } from "../../middleware/auth";
import { STAFF_MGMT, isPlatformWide, inRequesterScope, getStudentSchoolId, getParentSchoolId } from "./shared";

const router = new Hono<AppEnv>();

interface CountRow {
  cnt: string;
}

interface GuardianRequestRow {
  student_id: number;
  parent_id: number;
  requested_at: Date;
  student_first_name: string | null;
  student_last_name: string | null;
  school_id: number;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_email: string | null;
  parent_contact_number: string | null;
}

/* ============================================================
   PENDING GUARDIAN LINK REQUESTS
   Self-service guardian_code requests submitted by an already-approved,
   already-logged-in parent (via POST /parent/link-guardian) — these have no
   accompanying user-approval action to ride along with, so they need this
   dedicated review surface.
   ============================================================ */
router.get("/guardian-requests", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const params: any[] = [];
  let schoolFilter = "";
  if (!isPlatformWide(user)) {
    schoolFilter = "AND s.school_id = $1";
    params.push(user.schoolId);
  }

  const { rows } = await db.query<GuardianRequestRow>(
    `SELECT
       sg.student_id,
       sg.parent_id,
       sg.requested_at,
       s.first_name AS student_first_name,
       s.surname AS student_last_name,
       s.school_id,
       p.first_name AS parent_first_name,
       p.surname AS parent_last_name,
       p.email AS parent_email,
       p.contact_number AS parent_contact_number
     FROM student_guardians sg
     JOIN students s ON s.id = sg.student_id
     JOIN parents p ON p.id = sg.parent_id
     WHERE sg.status = 'pending' ${schoolFilter}
     ORDER BY sg.requested_at ASC`,
    params
  );

  return c.json(rows);
});

router.post("/guardian-requests/approve", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const { student_id, parent_id } = await c.req.json();
  if (!student_id || !parent_id) {
    return c.json({ message: "student_id and parent_id are required" }, 400);
  }

  const studentSchoolId = await getStudentSchoolId(db, student_id);
  if (studentSchoolId === null || !inRequesterScope(user, studentSchoolId)) {
    return c.json({ message: "Student not found" }, 404);
  }

  const { rowCount } = await db.query(
    "UPDATE student_guardians SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE student_id = $1 AND parent_id = $2 AND status = 'pending'",
    [student_id, parent_id]
  );
  if (rowCount === 0) {
    return c.json({ message: "No pending request found for this student and parent" }, 404);
  }

  return c.json({ message: "Guardian request approved" });
});

router.post("/guardian-requests/reject", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const { student_id, parent_id } = await c.req.json();
  if (!student_id || !parent_id) {
    return c.json({ message: "student_id and parent_id are required" }, 400);
  }

  const studentSchoolId = await getStudentSchoolId(db, student_id);
  if (studentSchoolId === null || !inRequesterScope(user, studentSchoolId)) {
    return c.json({ message: "Student not found" }, 404);
  }

  const { rowCount } = await db.query(
    "DELETE FROM student_guardians WHERE student_id = $1 AND parent_id = $2 AND status = 'pending'",
    [student_id, parent_id]
  );
  if (rowCount === 0) {
    return c.json({ message: "No pending request found for this student and parent" }, 404);
  }

  return c.json({ message: "Guardian request rejected" });
});

/* ============================================================
   ASSIGN GUARDIAN TO STUDENT (ADMIN-DIRECT — INSTANTLY APPROVED)
   The admin's action is itself the approval — no pending state. Upserts,
   so this also transparently handles "admin approves a parent who already
   had a pending self-service request for this student" in one call.
   ============================================================ */
router.post("/students/:studentId/assign-guardian", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const studentId = c.req.param("studentId")!;
  const { parent_id } = await c.req.json();

  if (!parent_id) return c.json({ message: "parent_id is required" }, 400);

  const studentSchoolId = await getStudentSchoolId(db, studentId);
  if (studentSchoolId === null || !inRequesterScope(user, studentSchoolId)) {
    return c.json({ message: "Student not found" }, 404);
  }

  const parentSchoolId = await getParentSchoolId(db, parent_id);
  if (parentSchoolId === null || parentSchoolId !== studentSchoolId) {
    return c.json({ message: "Parent does not belong to this student's school" }, 400);
  }

  await db.query(
    `INSERT INTO student_guardians (student_id, parent_id, status, approved_at)
     VALUES ($1, $2, 'approved', CURRENT_TIMESTAMP)
     ON CONFLICT (student_id, parent_id) DO UPDATE SET status = 'approved', approved_at = CURRENT_TIMESTAMP`,
    [studentId, parent_id]
  );

  return c.json({ message: "Guardian assigned" });
});

/* ============================================================
   REMOVE GUARDIAN FROM STUDENT
   Blocked while it's the student's only approved guardian — a student must
   always have at least one.
   ============================================================ */
router.post("/students/:studentId/remove-guardian", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const studentId = c.req.param("studentId")!;
  const { parent_id } = await c.req.json();

  if (!parent_id) return c.json({ message: "parent_id is required" }, 400);

  const studentSchoolId = await getStudentSchoolId(db, studentId);
  if (studentSchoolId === null || !inRequesterScope(user, studentSchoolId)) {
    return c.json({ message: "Student not found" }, 404);
  }

  const { rows: countRows } = await db.query<CountRow>(
    "SELECT COUNT(*) AS cnt FROM student_guardians WHERE student_id = $1 AND status = 'approved'",
    [studentId]
  );
  if (Number(countRows[0]?.cnt) <= 1) {
    return c.json({ message: "A student must have at least one guardian" }, 400);
  }

  await db.query("DELETE FROM student_guardians WHERE student_id = $1 AND parent_id = $2 AND status = 'approved'", [
    studentId,
    parent_id
  ]);

  return c.json({ message: "Guardian removed" });
});


export default router;
