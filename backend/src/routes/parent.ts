import { Hono } from "hono";
import type { AppEnv } from "../types/env";
import type { DbConnection } from "../config/db";
import { authMiddleware } from "../middleware/auth";
import { isFeatureEnabled } from "../utils/featureFlags";
import { generateUniqueGuardianCode } from "../utils/guardianCode";
import { createMandate } from "../utils/directDebitProvider";

const router = new Hono<AppEnv>();

interface IdRow {
  id: number;
}

interface ParentRow {
  id: number;
  school_id: number;
}

interface ChildRow {
  id: number;
  first_name: string | null;
  surname: string | null;
  gender: string | null;
  date_of_birth: Date | null;
  guardian_code: string;
}

interface TaskRow {
  id: number;
  title: string | null;
  description: string | null;
  due_date: Date | null;
  child_name: string;
  is_independent: boolean;
}

interface ScheduleRow {
  slot_id: number;
  student_id: number;
  child_name: string;
  slot_date: Date;
  start_time: string;
  end_time: string;
  class_name: string;
  subject_name: string | null;
  teacher_first_name: string;
  teacher_surname: string;
}

interface StatusRow {
  status: string;
}

interface MandateRow {
  status: string;
  created_at: Date;
  cancelled_at: Date | null;
}

interface ScheduleSlot {
  slot_id: number;
  slot_date: Date;
  start_time: string;
  end_time: string;
  class_name: string;
  subject_name: string | null;
  teacher_first_name: string;
  teacher_surname: string;
}

const loadParent = async (db: DbConnection, userId: number): Promise<ParentRow | null> => {
  const { rows } = await db.query<ParentRow>("SELECT id, school_id FROM parents WHERE user_id = $1", [userId]);
  return rows[0] || null;
};

/* ============================================================
   GET CHILDREN FOR LOGGED-IN PARENT
   ============================================================ */
router.get("/children", authMiddleware, async c => {
  const db = c.get("db");
  const userId = c.get("user")!.userId;

  const { rows: parentRows } = await db.query<IdRow>("SELECT id FROM parents WHERE user_id = $1", [userId]);

  const parent = parentRows[0];
  if (!parent) return c.json({ children: [] });

  const { rows: children } = await db.query<ChildRow>(
    `SELECT
       s.id,
       s.first_name,
       s.surname,
       s.gender,
       s.date_of_birth,
       s.guardian_code
     FROM students s
     JOIN student_guardians sg ON sg.student_id = s.id
     WHERE sg.parent_id = $1 AND sg.status = 'approved'`,
    [parent.id]
  );

  return c.json({ children });
});

/* ============================================================
   ADD CHILD FOR LOGGED-IN PARENT
   ============================================================ */
router.post("/add-child", authMiddleware, async c => {
  const db = c.get("db");
  const userId = c.get("user")!.userId;

  // Get parent ID + school from parents table — a child added here belongs
  // to the same school as the parent, same as at registration time.
  const { rows: parentRows } = await db.query<ParentRow>("SELECT id, school_id FROM parents WHERE user_id = $1", [userId]);

  const parent = parentRows[0];
  if (!parent) return c.json({ message: "Parent not found" }, 400);

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
  } = await c.req.json();

  if (!first_name || !surname || !gender || !date_of_birth) {
    return c.json({ message: "Missing required fields" }, 400);
  }
  if (!class_code || !String(class_code).trim()) {
    return c.json({ message: "Class code is required" }, 400);
  }

  const { rows: classRows } = await db.query<IdRow>(
    "SELECT id FROM classes WHERE school_id = $1 AND class_code = $2 LIMIT 1",
    [parent.school_id, String(class_code).trim()]
  );
  const classId = classRows[0]?.id;
  if (!classId) {
    return c.json({ message: `Invalid class code: ${class_code}` }, 400);
  }

  // There's already exactly one connection for the whole request, so the
  // transaction runs directly on it rather than a separately checked-out
  // pool connection.
  let studentId: number;
  try {
    await db.query("BEGIN");

    const guardianCode = await generateUniqueGuardianCode(db, parent.school_id);

    const {
      rows: [studentResult]
    } = await db.query<IdRow>(
      `
      INSERT INTO students
      (school_id, first_name, middle_name, surname, gender, date_of_birth,
       address1, address2, address3, city, postcode, medical_condition, guardian_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
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

    studentId = studentResult.id;
    await db.query(
      "INSERT INTO student_guardians (student_id, parent_id, status, approved_at) VALUES ($1, $2, 'approved', CURRENT_TIMESTAMP)",
      [studentId, parent.id]
    );
    await db.query("INSERT INTO student_classes (student_id, class_id) VALUES ($1, $2)", [studentId, classId]);

    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }

  // Return updated children list
  const { rows: children } = await db.query<ChildRow>(
    `
    SELECT s.id, s.first_name, s.surname, s.gender, s.date_of_birth, s.guardian_code
    FROM students s
    JOIN student_guardians sg ON sg.student_id = s.id
    WHERE sg.parent_id = $1 AND sg.status = 'approved'
    ORDER BY s.id DESC
    `,
    [parent.id]
  );

  return c.json({
    message: "Child added successfully",
    children
  });
});

/* ============================================================
   GET TASKS FOR ALL CHILDREN OF LOGGED-IN PARENT
   ============================================================ */
router.get("/tasks", authMiddleware, async c => {
  const db = c.get("db");
  const userId = c.get("user")!.userId;

  const { rows: parentRows } = await db.query<IdRow>("SELECT id FROM parents WHERE user_id = $1", [userId]);

  const parent = parentRows[0];
  if (!parent) return c.json({ tasks: [] });

  const { rows: tasks } = await db.query<TaskRow>(
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
     WHERE sg.parent_id = $1 AND (t.student_id IS NULL OR t.student_id = s.id)
     ORDER BY t.due_date ASC`,
    [parent.id]
  );

  return c.json({ tasks });
});

/* ============================================================
   GET CLASS SCHEDULE FOR ALL CHILDREN OF LOGGED-IN PARENT
   Grouped per child (by student_id) — each child's slots come from
   whichever class(es) they're enrolled in via student_classes.
   Children with no enrolled class or no slots simply won't have an
   entry; the frontend already has the full child list separately.
   ============================================================ */
router.get("/schedule", authMiddleware, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  if (!(await isFeatureEnabled(db, "timetable", user.schoolId))) {
    return c.json({ message: "The timetable feature is currently disabled for this school" }, 403);
  }

  const { rows: parentRows } = await db.query<IdRow>("SELECT id FROM parents WHERE user_id = $1", [user.userId]);

  const parent = parentRows[0];
  if (!parent) return c.json({ schedule: [] });

  const { rows } = await db.query<ScheduleRow>(
    `SELECT
       ts.id AS slot_id,
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
     WHERE sg.parent_id = $1
     ORDER BY s.id, ts.slot_date, ts.start_time`,
    [parent.id]
  );

  const scheduleMap = new Map<number, { student_id: number; child_name: string; slots: ScheduleSlot[] }>();
  rows.forEach(row => {
    if (!scheduleMap.has(row.student_id)) {
      scheduleMap.set(row.student_id, { student_id: row.student_id, child_name: row.child_name, slots: [] });
    }
    scheduleMap.get(row.student_id)!.slots.push({
      slot_id: row.slot_id,
      slot_date: row.slot_date,
      start_time: row.start_time,
      end_time: row.end_time,
      class_name: row.class_name,
      subject_name: row.subject_name,
      teacher_first_name: row.teacher_first_name,
      teacher_surname: row.teacher_surname
    });
  });

  return c.json({ schedule: Array.from(scheduleMap.values()) });
});

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
router.post("/link-guardian", authMiddleware, async c => {
  const db = c.get("db");
  const userId = c.get("user")!.userId;

  const { rows: parentRows } = await db.query<ParentRow>("SELECT id, school_id FROM parents WHERE user_id = $1", [userId]);
  const parent = parentRows[0];
  if (!parent) return c.json({ message: "Parent not found" }, 400);

  const body = await c.req.json().catch(() => ({}));
  const guardianCode = String(body?.guardian_code || "").trim();
  if (!guardianCode) return c.json({ message: "Guardian code is required" }, 400);

  const { rows: studentRows } = await db.query<IdRow>(
    "SELECT id FROM students WHERE school_id = $1 AND guardian_code = $2",
    [parent.school_id, guardianCode]
  );
  const student = studentRows[0];
  if (!student) return c.json({ message: "Invalid guardian code" }, 404);

  const { rows: existingRows } = await db.query<StatusRow>(
    "SELECT status FROM student_guardians WHERE student_id = $1 AND parent_id = $2",
    [student.id, parent.id]
  );
  const existing = existingRows[0];
  if (existing?.status === "approved") {
    return c.json({ message: "You are already linked to this child" }, 409);
  }
  if (existing?.status === "pending") {
    return c.json({ message: "A request for this child is already pending" }, 409);
  }

  await db.query("INSERT INTO student_guardians (student_id, parent_id, status) VALUES ($1, $2, 'pending')", [
    student.id,
    parent.id
  ]);

  return c.json({ message: "Request submitted. Pending admin approval." }, 201);
});

/* ============================================================
   DIRECT DEBIT MANDATE — SELF-SERVE SETUP
   Parent-driven, behind "direct_debit". One mandate row per parent
   (enforced by payment_mandates' unique key on parent_id) — set up once,
   reused for every fee generated afterwards rather than per fee.
   ============================================================ */
router.get("/direct-debit/mandate", authMiddleware, async c => {
  const db = c.get("db");
  const parent = await loadParent(db, c.get("user")!.userId);
  if (!parent) return c.json({ message: "Parent not found" }, 400);

  if (!(await isFeatureEnabled(db, "direct_debit", parent.school_id))) {
    return c.json({ message: "Direct debit is currently disabled for this school" }, 403);
  }

  const { rows } = await db.query<MandateRow>(
    "SELECT status, created_at, cancelled_at FROM payment_mandates WHERE parent_id = $1",
    [parent.id]
  );
  return c.json({ mandate: rows[0] || null });
});

router.post("/direct-debit/mandate", authMiddleware, async c => {
  const db = c.get("db");
  const parent = await loadParent(db, c.get("user")!.userId);
  if (!parent) return c.json({ message: "Parent not found" }, 400);

  if (!(await isFeatureEnabled(db, "direct_debit", parent.school_id))) {
    return c.json({ message: "Direct debit is currently disabled for this school" }, 403);
  }

  const { rows: existingRows } = await db.query<StatusRow>("SELECT status FROM payment_mandates WHERE parent_id = $1", [
    parent.id
  ]);
  const existing = existingRows[0];
  if (existing?.status === "active") {
    return c.json({ message: "Direct debit is already set up" }, 409);
  }

  const providerMandate = await createMandate(parent.id);

  if (existing) {
    // Re-setting up after a cancellation — same mandate row, fresh
    // provider IDs, so a stale provider_mandate_id from the cancelled
    // mandate is never reused for a new one.
    await db.query(
      `UPDATE payment_mandates
       SET status = 'active', provider_customer_id = $1, provider_mandate_id = $2, cancelled_at = NULL
       WHERE parent_id = $3`,
      [providerMandate.providerCustomerId, providerMandate.providerMandateId, parent.id]
    );
  } else {
    await db.query(
      `INSERT INTO payment_mandates (parent_id, provider, provider_customer_id, provider_mandate_id, status)
       VALUES ($1, 'stub', $2, $3, 'active')`,
      [parent.id, providerMandate.providerCustomerId, providerMandate.providerMandateId]
    );
  }

  return c.json({ message: "Direct debit set up" }, existing ? 200 : 201);
});

router.post("/direct-debit/mandate/cancel", authMiddleware, async c => {
  const db = c.get("db");
  const parent = await loadParent(db, c.get("user")!.userId);
  if (!parent) return c.json({ message: "Parent not found" }, 400);

  if (!(await isFeatureEnabled(db, "direct_debit", parent.school_id))) {
    return c.json({ message: "Direct debit is currently disabled for this school" }, 403);
  }

  const { rowCount } = await db.query(
    "UPDATE payment_mandates SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE parent_id = $1 AND status = 'active'",
    [parent.id]
  );
  if (rowCount === 0) {
    return c.json({ message: "No active direct debit mandate to cancel" }, 404);
  }

  return c.json({ message: "Direct debit cancelled" });
});

export default router;
