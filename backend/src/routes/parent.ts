import { Router } from "express";
import { pool } from "../config/db";
import { authMiddleware } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/auth";
import { isFeatureEnabled } from "../utils/featureFlags";
import { generateUniqueGuardianCode } from "../utils/guardianCode";
import { asyncHandler } from "../utils/asyncHandler";
import { createMandate } from "../utils/directDebitProvider";

const router = Router();

const loadParent = async (userId: number) => {
  const [rows] = await pool.query(
    "SELECT id, school_id FROM parents WHERE user_id = ?",
    [userId]
  );
  return (rows as any[])[0] || null;
};

/* ============================================================
   GET CHILDREN FOR LOGGED-IN PARENT
   ============================================================ */
router.get(
  "/children",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.userId;

    const [parentRows] = await pool.query(
      "SELECT id FROM parents WHERE user_id = ?",
      [userId]
    );

    const parent = (parentRows as any)[0];
    if (!parent) return res.json({ children: [] });

    const [children] = await pool.query(
      `SELECT
         s.id,
         s.first_name,
         s.surname,
         s.gender,
         s.date_of_birth,
         s.guardian_code
       FROM students s
       JOIN student_guardians sg ON sg.student_id = s.id
       WHERE sg.parent_id = ? AND sg.status = 'approved'`,
      [parent.id]
    );

    res.json({ children });
  })
);

/* ============================================================
   ADD CHILD FOR LOGGED-IN PARENT
   ============================================================ */
router.post(
  "/add-child",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.userId;

    // Get parent ID + school from parents table — a child added here belongs
    // to the same school as the parent, same as at registration time.
    const [parentRows] = await pool.query(
      "SELECT id, school_id FROM parents WHERE user_id = ?",
      [userId]
    );

    const parent = (parentRows as any)[0];
    if (!parent) return res.status(400).json({ message: "Parent not found" });

    const {
      first_name,
      middle_name,
      surname,
      gender,
      date_of_birth,
      address1,
      address2,
      address3,
      city,
      postcode,
      medical_condition,
      class_code
    } = req.body;

    if (!first_name || !surname || !gender || !date_of_birth) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (!class_code || !String(class_code).trim()) {
      return res.status(400).json({ message: "Class code is required" });
    }

    const [classRows] = await pool.query(
      "SELECT id FROM classes WHERE school_id = ? AND class_code = ? LIMIT 1",
      [parent.school_id, String(class_code).trim()]
    );
    const classId = (classRows as any)[0]?.id;
    if (!classId) {
      return res.status(400).json({ message: `Invalid class code: ${class_code}` });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const guardianCode = await generateUniqueGuardianCode(conn, parent.school_id);

      const [studentResult] = await conn.query(
        `
        INSERT INTO students
        (school_id, first_name, middle_name, surname, gender, date_of_birth,
         address1, address2, address3, city, postcode, medical_condition, guardian_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          parent.school_id,
          first_name,
          middle_name,
          surname,
          gender,
          date_of_birth,
          address1,
          address2,
          address3,
          city,
          postcode,
          medical_condition,
          guardianCode
        ]
      );

      const studentId = (studentResult as any).insertId;
      await conn.query(
        "INSERT INTO student_guardians (student_id, parent_id, status, approved_at) VALUES (?, ?, 'approved', CURRENT_TIMESTAMP)",
        [studentId, parent.id]
      );
      await conn.query(
        "INSERT INTO student_classes (student_id, class_id) VALUES (?, ?)",
        [studentId, classId]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // Return updated children list
    const [children] = await pool.query(
      `
      SELECT s.id, s.first_name, s.surname, s.gender, s.date_of_birth, s.guardian_code
      FROM students s
      JOIN student_guardians sg ON sg.student_id = s.id
      WHERE sg.parent_id = ? AND sg.status = 'approved'
      ORDER BY s.id DESC
      `,
      [parent.id]
    );

    res.json({
      message: "Child added successfully",
      children
    });
  })
);

/* ============================================================
   GET TASKS FOR ALL CHILDREN OF LOGGED-IN PARENT
   ============================================================ */
router.get(
  "/tasks",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.userId;

    const [parentRows] = await pool.query(
      "SELECT id FROM parents WHERE user_id = ?",
      [userId]
    );

    const parent = (parentRows as any)[0];
    if (!parent) return res.json({ tasks: [] });

    const [tasks] = await pool.query(
      `SELECT
         t.id,
         t.title,
         t.description,
         t.due_date,
         CONCAT(s.first_name, ' ', s.surname) AS child_name,
         t.student_id IS NOT NULL AS is_independent
       FROM tasks t
       JOIN classes c ON t.class_id = c.id
       JOIN student_classes sc ON sc.class_id = c.id
       JOIN students s ON s.id = sc.student_id
       JOIN student_guardians sg ON sg.student_id = s.id AND sg.status = 'approved'
       WHERE sg.parent_id = ? AND (t.student_id IS NULL OR t.student_id = s.id)
       ORDER BY t.due_date ASC`,
      [parent.id]
    );

    res.json({ tasks });
  })
);

/* ============================================================
   GET CLASS SCHEDULE FOR ALL CHILDREN OF LOGGED-IN PARENT
   Grouped per child (by student_id) — each child's slots come from
   whichever class(es) they're enrolled in via student_classes.
   Children with no enrolled class or no slots simply won't have an
   entry; the frontend already has the full child list separately.
   ============================================================ */
router.get(
  "/schedule",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!(await isFeatureEnabled("timetable", req.user!.schoolId))) {
      return res.status(403).json({ message: "The timetable feature is currently disabled for this school" });
    }

    const userId = req.user!.userId;

    const [parentRows] = await pool.query(
      "SELECT id FROM parents WHERE user_id = ?",
      [userId]
    );

    const parent = (parentRows as any)[0];
    if (!parent) return res.json({ schedule: [] });

    const [rows] = await pool.query(
      `SELECT
         s.id AS student_id,
         CONCAT(s.first_name, ' ', s.surname) AS child_name,
         ts.slot_date,
         ts.start_time,
         ts.end_time,
         c.class_name,
         ts.subject_name,
         COALESCE(sd.first_name, '') AS teacher_first_name,
         COALESCE(sd.surname, '') AS teacher_surname
       FROM students s
       JOIN student_guardians sg ON sg.student_id = s.id AND sg.status = 'approved'
       JOIN student_classes sc ON sc.student_id = s.id
       JOIN classes c ON c.id = sc.class_id
       JOIN timetable_slots ts ON ts.class_id = c.id
       LEFT JOIN staff_details sd ON sd.user_id = ts.teacher_id
       WHERE sg.parent_id = ?
       ORDER BY s.id, ts.slot_date, ts.start_time`,
      [parent.id]
    );

    const scheduleMap = new Map<number, { student_id: number; child_name: string; slots: any[] }>();
    (rows as any[]).forEach(row => {
      if (!scheduleMap.has(row.student_id)) {
        scheduleMap.set(row.student_id, { student_id: row.student_id, child_name: row.child_name, slots: [] });
      }
      scheduleMap.get(row.student_id)!.slots.push({
        slot_date: row.slot_date,
        start_time: row.start_time,
        end_time: row.end_time,
        class_name: row.class_name,
        subject_name: row.subject_name,
        teacher_first_name: row.teacher_first_name,
        teacher_surname: row.teacher_surname
      });
    });

    res.json({ schedule: Array.from(scheduleMap.values()) });
  })
);

/* ============================================================
   SELF-SERVICE: REQUEST TO LINK AS AN ADDITIONAL GUARDIAN
   For an already-approved, logged-in parent linking to a child that isn't
   theirs yet (e.g. a separated parent adding themselves later, not at
   initial registration). Always inserted as 'pending' — unlike a
   guardian_links entry submitted alongside a brand-new registration, there
   is no accompanying user-approval action for this to ride along with, so
   it always needs an explicit admin decision via the Guardian Requests
   review surface.
   ============================================================ */
router.post(
  "/link-guardian",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.userId;

    const [parentRows] = await pool.query(
      "SELECT id, school_id FROM parents WHERE user_id = ?",
      [userId]
    );
    const parent = (parentRows as any)[0];
    if (!parent) return res.status(400).json({ message: "Parent not found" });

    const guardianCode = String(req.body?.guardian_code || "").trim();
    if (!guardianCode) return res.status(400).json({ message: "Guardian code is required" });

    const [studentRows] = await pool.query(
      "SELECT id FROM students WHERE school_id = ? AND guardian_code = ?",
      [parent.school_id, guardianCode]
    );
    const student = (studentRows as any)[0];
    if (!student) return res.status(404).json({ message: "Invalid guardian code" });

    const [existingRows] = await pool.query(
      "SELECT status FROM student_guardians WHERE student_id = ? AND parent_id = ?",
      [student.id, parent.id]
    );
    const existing = (existingRows as any)[0];
    if (existing?.status === "approved") {
      return res.status(409).json({ message: "You are already linked to this child" });
    }
    if (existing?.status === "pending") {
      return res.status(409).json({ message: "A request for this child is already pending" });
    }

    await pool.query(
      "INSERT INTO student_guardians (student_id, parent_id, status) VALUES (?, ?, 'pending')",
      [student.id, parent.id]
    );

    res.status(201).json({ message: "Request submitted. Pending admin approval." });
  })
);

/* ============================================================
   DIRECT DEBIT MANDATE — SELF-SERVE SETUP
   Parent-driven, behind "direct_debit". One mandate row per parent
   (enforced by payment_mandates' unique key on parent_id) — set up once,
   reused for every fee generated afterwards rather than per fee.
   ============================================================ */
router.get(
  "/direct-debit/mandate",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parent = await loadParent(req.user!.userId);
    if (!parent) return res.status(400).json({ message: "Parent not found" });

    if (!(await isFeatureEnabled("direct_debit", parent.school_id))) {
      return res.status(403).json({ message: "Direct debit is currently disabled for this school" });
    }

    const [rows] = await pool.query(
      "SELECT status, created_at, cancelled_at FROM payment_mandates WHERE parent_id = ?",
      [parent.id]
    );
    res.json({ mandate: (rows as any[])[0] || null });
  })
);

router.post(
  "/direct-debit/mandate",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parent = await loadParent(req.user!.userId);
    if (!parent) return res.status(400).json({ message: "Parent not found" });

    if (!(await isFeatureEnabled("direct_debit", parent.school_id))) {
      return res.status(403).json({ message: "Direct debit is currently disabled for this school" });
    }

    const [existingRows] = await pool.query(
      "SELECT status FROM payment_mandates WHERE parent_id = ?",
      [parent.id]
    );
    const existing = (existingRows as any[])[0];
    if (existing?.status === "active") {
      return res.status(409).json({ message: "Direct debit is already set up" });
    }

    const providerMandate = await createMandate(parent.id);

    if (existing) {
      // Re-setting up after a cancellation — same mandate row, fresh
      // provider IDs, so a stale provider_mandate_id from the cancelled
      // mandate is never reused for a new one.
      await pool.query(
        `UPDATE payment_mandates
         SET status = 'active', provider_customer_id = ?, provider_mandate_id = ?, cancelled_at = NULL
         WHERE parent_id = ?`,
        [providerMandate.providerCustomerId, providerMandate.providerMandateId, parent.id]
      );
    } else {
      await pool.query(
        `INSERT INTO payment_mandates (parent_id, provider, provider_customer_id, provider_mandate_id, status)
         VALUES (?, 'stub', ?, ?, 'active')`,
        [parent.id, providerMandate.providerCustomerId, providerMandate.providerMandateId]
      );
    }

    res.status(existing ? 200 : 201).json({ message: "Direct debit set up" });
  })
);

router.post(
  "/direct-debit/mandate/cancel",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parent = await loadParent(req.user!.userId);
    if (!parent) return res.status(400).json({ message: "Parent not found" });

    if (!(await isFeatureEnabled("direct_debit", parent.school_id))) {
      return res.status(403).json({ message: "Direct debit is currently disabled for this school" });
    }

    const [result] = await pool.query(
      "UPDATE payment_mandates SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE parent_id = ? AND status = 'active'",
      [parent.id]
    );
    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ message: "No active direct debit mandate to cancel" });
    }

    res.json({ message: "Direct debit cancelled" });
  })
);

export default router;
