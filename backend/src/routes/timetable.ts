import { Hono } from "hono";
import type { AppEnv } from "../types/env";
import type { DbConnection } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { isFeatureEnabled } from "../utils/featureFlags";
import { HttpError } from "../utils/httpError";

const router = new Hono<AppEnv>();

// Every `... RETURNING id` in this file resolves to this same
// single-column shape.
interface IdRow {
  id: number;
}

// `SELECT 1 ...` existence checks — only .length is ever read.
interface ExistsRow {
  [column: string]: unknown;
}

interface SchoolIdRow {
  school_id: number;
}

interface TermRow {
  id: number;
  name: string;
  start_date: Date;
  end_date: Date;
}

// GET /slots — every class's slots at once, school-wide.
interface SchoolSlotRow {
  id: number;
  class_id: number;
  class_name: string;
  term_id: number | null;
  slot_date: Date;
  start_time: string;
  end_time: string;
  subject_name: string | null;
  teacher_id: number | null;
  teacher_first_name: string;
  teacher_surname: string;
}

// GET /classes/:classId/slots — INNER JOINed to school_terms, so term_id
// is never null in the *result*, even though the column itself is
// nullable in the schema.
interface ClassSlotRow {
  id: number;
  term_id: number;
  term_name: string;
  slot_date: Date;
  start_time: string;
  end_time: string;
  subject_name: string | null;
  teacher_id: number | null;
  teacher_first_name: string;
  teacher_surname: string;
}

interface SlotClassSchoolRow {
  id: number;
  class_id: number;
  school_id: number;
}

interface SlotSchoolRow {
  id: number;
  school_id: number;
}

interface EventRow {
  id: number;
  title: string;
  description: string | null;
  event_date: Date;
  start_time: string | null;
  end_time: string | null;
  created_at: Date;
}

interface EventSchoolRow {
  id: number;
  school_id: number;
}

// Deliberately admin/owner only, not the wider STAFF_MGMT-style group used
// elsewhere — a school's weekly schedule and events calendar is a
// leadership planning tool, per the product decision behind this feature.
const ADMIN_OWNER = requireRole("admin", "owner");

// Term dates (not the slots/events management) are also readable by
// parents, so they can see when each term starts/ends without any of the
// scheduling capability admin/owner get.
const VIEW_TERMS = requireRole("admin", "owner", "parent");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isNonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

const getClassSchoolId = async (db: DbConnection, classId: string | number): Promise<number | null> => {
  const { rows } = await db.query<SchoolIdRow>("SELECT school_id FROM classes WHERE id = $1", [classId]);
  return rows[0]?.school_id ?? null;
};

const validateTeacher = async (db: DbConnection, teacherId: number, schoolId: number): Promise<boolean> => {
  const { rows } = await db.query<ExistsRow>(
    `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.school_id = $2 AND r.name = 'teacher'`,
    [teacherId, schoolId]
  );
  return rows.length > 0;
};

const validateSlotBody = (body: any): string | null => {
  if (!DATE_RE.test(body.slot_date || "")) return "slot_date is required, in YYYY-MM-DD format";
  if (!TIME_RE.test(body.start_time || "") || !TIME_RE.test(body.end_time || "")) {
    return "start_time and end_time are required, in HH:MM format";
  }
  if (body.end_time <= body.start_time) return "end_time must be after start_time";
  return null;
};

const validateTerm = async (db: DbConnection, termId: number, schoolId: number): Promise<boolean> => {
  const { rows } = await db.query<ExistsRow>("SELECT 1 FROM school_terms WHERE id = $1 AND school_id = $2", [
    termId,
    schoolId
  ]);
  return rows.length > 0;
};

// The term a slot belongs to is never chosen directly — it's derived from
// slot_date, so a slot always lands in whichever term's date range
// actually contains it. Returns null if no term at this school covers the
// date (the caller must create one first).
const resolveTermForDate = async (db: DbConnection, schoolId: number, slotDate: string): Promise<number | null> => {
  const { rows } = await db.query<IdRow>(
    `SELECT id FROM school_terms WHERE school_id = $1 AND start_date <= $2 AND end_date >= $3 ORDER BY start_date ASC LIMIT 1`,
    [schoolId, slotDate, slotDate]
  );
  return rows[0]?.id ?? null;
};

/* ============================================================
   LIST SCHOOL TERMS — ADMIN, OWNER, PARENT
   The same school_terms table report cards uses, but with its own
   role gate rather than reusing report-cards' admin-only one — the two
   features were deliberately scoped to different roles. Parents get
   read access to the dates here too, so they can see term dates.
   Not gated by the flag (like GET /events below): dashboards need this
   to build the year view before necessarily having any slots yet.
   ============================================================ */
router.get("/terms", authMiddleware, VIEW_TERMS, async c => {
  const { rows } = await c
    .get("db")
    .query<TermRow>("SELECT id, name, start_date, end_date FROM school_terms WHERE school_id = $1 ORDER BY start_date ASC", [
      c.get("user")!.schoolId
    ]);
  return c.json({ terms: rows });
});

/* ============================================================
   CREATE A SCHOOL TERM — ADMIN, OWNER
   ============================================================ */
router.post("/terms", authMiddleware, ADMIN_OWNER, async c => {
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

  let row: IdRow;
  try {
    ({
      rows: [row]
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
      term: { id: row.id, name: String(name).trim(), start_date, end_date }
    },
    201
  );
});

/* ============================================================
   LIST EVERY CLASS'S TIMETABLE SLOTS FOR ONE TERM — SCHOOL-WIDE CALENDAR
   Powers the weekly grid: every class's slots at once for a given term,
   so admin/owner can see what's scheduled when across the whole school,
   not one class at a time. term_id is required — schedules are scoped to
   a term, so there's no single well-defined "all slots" view.
   ============================================================ */
router.get("/slots", authMiddleware, ADMIN_OWNER, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  if (!(await isFeatureEnabled(db, "timetable", user.schoolId))) {
    return c.json({ message: "The timetable feature is currently disabled for this school" }, 403);
  }

  const termId = Number(c.req.query("term_id"));
  if (!termId) return c.json({ message: "term_id query parameter is required" }, 400);
  if (!(await validateTerm(db, termId, user.schoolId!))) {
    return c.json({ message: "Unknown term for this school" }, 400);
  }

  const { rows } = await db.query<SchoolSlotRow>(
    `SELECT ts.id, ts.class_id, c.class_name, ts.term_id, ts.slot_date, ts.start_time, ts.end_time,
            ts.subject_name, ts.teacher_id,
            COALESCE(sd.first_name, '') AS teacher_first_name,
            COALESCE(sd.surname, '') AS teacher_surname
     FROM timetable_slots ts
     JOIN classes c ON c.id = ts.class_id
     LEFT JOIN staff_details sd ON sd.user_id = ts.teacher_id
     WHERE c.school_id = $1 AND ts.term_id = $2
     ORDER BY ts.slot_date, ts.start_time`,
    [user.schoolId, termId]
  );

  return c.json({ slots: rows });
});

/* ============================================================
   LIST A CLASS'S TIMETABLE SLOTS FOR ONE TERM
   term_id is optional — omit it to see every one of this class's slots
   across every term.
   ============================================================ */
router.get("/classes/:classId/slots", authMiddleware, ADMIN_OWNER, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = Number(c.req.param("classId"));
  const schoolId = await getClassSchoolId(db, classId);
  if (schoolId === null) return c.json({ message: "Class not found" }, 404);
  if (schoolId !== user.schoolId) return c.json({ message: "You do not have access to this class" }, 403);

  if (!(await isFeatureEnabled(db, "timetable", schoolId))) {
    return c.json({ message: "The timetable feature is currently disabled for this school" }, 403);
  }

  const params: any[] = [classId];
  // The optional fragment is appended to a base clause whose own
  // placeholder is always $1, so the fragment's placeholder is always $2
  // once concatenated — a fixed number rather than something computed only
  // after every fragment is assembled, since there's just the one optional
  // fragment here.
  let termFilter = "";
  const termIdParam = c.req.query("term_id");
  if (termIdParam) {
    const termId = Number(termIdParam);
    if (!(await validateTerm(db, termId, schoolId))) {
      return c.json({ message: "Unknown term for this school" }, 400);
    }
    termFilter = "AND ts.term_id = $2";
    params.push(termId);
  }

  const { rows } = await db.query<ClassSlotRow>(
    `SELECT ts.id, ts.term_id, t.name AS term_name, ts.slot_date, ts.start_time, ts.end_time, ts.subject_name, ts.teacher_id,
            COALESCE(sd.first_name, '') AS teacher_first_name,
            COALESCE(sd.surname, '') AS teacher_surname
     FROM timetable_slots ts
     JOIN school_terms t ON t.id = ts.term_id
     LEFT JOIN staff_details sd ON sd.user_id = ts.teacher_id
     WHERE ts.class_id = $1 ${termFilter}
     ORDER BY ts.slot_date, ts.start_time`,
    params
  );

  return c.json({ slots: rows });
});

/* ============================================================
   CREATE A TIMETABLE SLOT FOR A CLASS
   The term is never chosen directly — it's resolved from slot_date.
   ============================================================ */
router.post("/classes/:classId/slots", authMiddleware, ADMIN_OWNER, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = Number(c.req.param("classId"));
  const schoolId = await getClassSchoolId(db, classId);
  if (schoolId === null) return c.json({ message: "Class not found" }, 404);
  if (schoolId !== user.schoolId) return c.json({ message: "You do not have access to this class" }, 403);

  if (!(await isFeatureEnabled(db, "timetable", schoolId))) {
    return c.json({ message: "The timetable feature is currently disabled for this school" }, 403);
  }

  const body = await c.req.json();
  const validationError = validateSlotBody(body);
  if (validationError) return c.json({ message: validationError }, 400);

  const { slot_date, start_time, end_time, subject_name, teacher_id } = body;

  const termId = await resolveTermForDate(db, schoolId, slot_date);
  if (!termId) {
    return c.json({ message: "No term covers this date — create one in the Terms section first" }, 400);
  }

  if (teacher_id && !(await validateTeacher(db, teacher_id, schoolId))) {
    return c.json({ message: "teacher_id must be a teacher at this school" }, 400);
  }

  let row: IdRow;
  try {
    ({
      rows: [row]
    } = await db.query<IdRow>(
      `INSERT INTO timetable_slots (class_id, term_id, slot_date, start_time, end_time, subject_name, teacher_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        classId,
        termId,
        slot_date,
        start_time,
        end_time,
        isNonEmpty(subject_name) ? String(subject_name).trim() : null,
        teacher_id || null
      ]
    ));
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new HttpError(409, "A slot already exists for this class, date and start time");
    }
    throw err;
  }

  return c.json({ message: "Timetable slot created", slot: { id: row.id, term_id: termId } }, 201);
});

/* ============================================================
   EDIT A TIMETABLE SLOT
   Moving slot_date can move it into a different term — re-resolved the
   same way as creation.
   ============================================================ */
router.put("/slots/:id", authMiddleware, ADMIN_OWNER, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const slotId = Number(c.req.param("id"));
  const { rows } = await db.query<SlotClassSchoolRow>(
    `SELECT ts.id, ts.class_id, c.school_id FROM timetable_slots ts JOIN classes c ON c.id = ts.class_id WHERE ts.id = $1`,
    [slotId]
  );
  const slot = rows[0];
  if (!slot) return c.json({ message: "Timetable slot not found" }, 404);
  if (slot.school_id !== user.schoolId) return c.json({ message: "You do not have access to this class" }, 403);

  if (!(await isFeatureEnabled(db, "timetable", slot.school_id))) {
    return c.json({ message: "The timetable feature is currently disabled for this school" }, 403);
  }

  const body = await c.req.json();
  const validationError = validateSlotBody(body);
  if (validationError) return c.json({ message: validationError }, 400);

  const { slot_date, start_time, end_time, subject_name, teacher_id } = body;

  const termId = await resolveTermForDate(db, slot.school_id, slot_date);
  if (!termId) {
    return c.json({ message: "No term covers this date — create one in the Terms section first" }, 400);
  }

  if (teacher_id && !(await validateTeacher(db, teacher_id, slot.school_id))) {
    return c.json({ message: "teacher_id must be a teacher at this school" }, 400);
  }

  try {
    await db.query(
      `UPDATE timetable_slots
       SET term_id = $1, slot_date = $2, start_time = $3, end_time = $4, subject_name = $5, teacher_id = $6
       WHERE id = $7`,
      [
        termId,
        slot_date,
        start_time,
        end_time,
        isNonEmpty(subject_name) ? String(subject_name).trim() : null,
        teacher_id || null,
        slotId
      ]
    );
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new HttpError(409, "A slot already exists for this class, date and start time");
    }
    throw err;
  }

  return c.json({ message: "Timetable slot updated" });
});

/* ============================================================
   DELETE A TIMETABLE SLOT
   ============================================================ */
router.delete("/slots/:id", authMiddleware, ADMIN_OWNER, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const slotId = Number(c.req.param("id"));
  const { rows } = await db.query<SlotSchoolRow>(
    `SELECT ts.id, c.school_id FROM timetable_slots ts JOIN classes c ON c.id = ts.class_id WHERE ts.id = $1`,
    [slotId]
  );
  const slot = rows[0];
  if (!slot) return c.json({ message: "Timetable slot not found" }, 404);
  if (slot.school_id !== user.schoolId) return c.json({ message: "You do not have access to this class" }, 403);

  if (!(await isFeatureEnabled(db, "timetable", slot.school_id))) {
    return c.json({ message: "The timetable feature is currently disabled for this school" }, 403);
  }

  await db.query("DELETE FROM timetable_slots WHERE id = $1", [slotId]);
  return c.json({ message: "Timetable slot deleted" });
});

/* ============================================================
   LIST SCHOOL EVENTS — ADMIN, OWNER
   Not gated by the flag itself (like report-cards' GET /terms): dashboards
   fetch this unconditionally on load, so gating it would 403 the whole
   dashboard for any school that hasn't turned the flag on yet. The flag
   instead controls whether the Timetable nav item/section is shown at
   all, and gates every write below.
   ============================================================ */
router.get("/events", authMiddleware, ADMIN_OWNER, async c => {
  const { rows } = await c.get("db").query<EventRow>(
    `SELECT id, title, description, event_date, start_time, end_time, created_at
     FROM school_events
     WHERE school_id = $1
     ORDER BY event_date ASC, start_time ASC`,
    [c.get("user")!.schoolId]
  );

  return c.json({ events: rows });
});

/* ============================================================
   CREATE A SCHOOL EVENT
   ============================================================ */
router.post("/events", authMiddleware, ADMIN_OWNER, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  if (!(await isFeatureEnabled(db, "timetable", user.schoolId))) {
    return c.json({ message: "The timetable feature is currently disabled for this school" }, 403);
  }

  const { title, description, event_date, start_time, end_time } = await c.req.json();

  if (!isNonEmpty(title)) return c.json({ message: "Title is required" }, 400);
  if (!isNonEmpty(event_date)) return c.json({ message: "event_date is required" }, 400);
  if (start_time && !TIME_RE.test(start_time)) return c.json({ message: "start_time must be in HH:MM format" }, 400);
  if (end_time && !TIME_RE.test(end_time)) return c.json({ message: "end_time must be in HH:MM format" }, 400);
  if (start_time && end_time && end_time <= start_time) {
    return c.json({ message: "end_time must be after start_time" }, 400);
  }

  const {
    rows: [row]
  } = await db.query<IdRow>(
    `INSERT INTO school_events (school_id, title, description, event_date, start_time, end_time, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      user.schoolId,
      String(title).trim(),
      description ? String(description).trim() : null,
      event_date,
      start_time || null,
      end_time || null,
      user.userId
    ]
  );

  return c.json({ message: "Event created", event: { id: row.id } }, 201);
});

/* ============================================================
   EDIT A SCHOOL EVENT
   ============================================================ */
router.put("/events/:id", authMiddleware, ADMIN_OWNER, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const eventId = Number(c.req.param("id"));
  const { rows } = await db.query<EventSchoolRow>("SELECT id, school_id FROM school_events WHERE id = $1", [eventId]);
  const event = rows[0];
  if (!event) return c.json({ message: "Event not found" }, 404);
  if (event.school_id !== user.schoolId) return c.json({ message: "You do not have access to this event" }, 403);

  if (!(await isFeatureEnabled(db, "timetable", event.school_id))) {
    return c.json({ message: "The timetable feature is currently disabled for this school" }, 403);
  }

  const { title, description, event_date, start_time, end_time } = await c.req.json();

  if (!isNonEmpty(title)) return c.json({ message: "Title is required" }, 400);
  if (!isNonEmpty(event_date)) return c.json({ message: "event_date is required" }, 400);
  if (start_time && !TIME_RE.test(start_time)) return c.json({ message: "start_time must be in HH:MM format" }, 400);
  if (end_time && !TIME_RE.test(end_time)) return c.json({ message: "end_time must be in HH:MM format" }, 400);
  if (start_time && end_time && end_time <= start_time) {
    return c.json({ message: "end_time must be after start_time" }, 400);
  }

  await db.query(
    `UPDATE school_events
     SET title = $1, description = $2, event_date = $3, start_time = $4, end_time = $5
     WHERE id = $6`,
    [String(title).trim(), description ? String(description).trim() : null, event_date, start_time || null, end_time || null, eventId]
  );

  return c.json({ message: "Event updated" });
});

/* ============================================================
   DELETE A SCHOOL EVENT
   ============================================================ */
router.delete("/events/:id", authMiddleware, ADMIN_OWNER, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const eventId = Number(c.req.param("id"));
  const { rows } = await db.query<EventSchoolRow>("SELECT id, school_id FROM school_events WHERE id = $1", [eventId]);
  const event = rows[0];
  if (!event) return c.json({ message: "Event not found" }, 404);
  if (event.school_id !== user.schoolId) return c.json({ message: "You do not have access to this event" }, 403);

  if (!(await isFeatureEnabled(db, "timetable", event.school_id))) {
    return c.json({ message: "The timetable feature is currently disabled for this school" }, 403);
  }

  await db.query("DELETE FROM school_events WHERE id = $1", [eventId]);
  return c.json({ message: "Event deleted" });
});

export default router;
