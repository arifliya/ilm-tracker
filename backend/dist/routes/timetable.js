"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../config/db");
const auth_1 = require("../middleware/auth");
const featureFlags_1 = require("../utils/featureFlags");
const asyncHandler_1 = require("../utils/asyncHandler");
const httpError_1 = require("../utils/httpError");
const router = (0, express_1.Router)();
// Deliberately admin/owner only, not the wider STAFF_MGMT-style group used
// elsewhere — a school's weekly schedule and events calendar is a
// leadership planning tool, per the product decision behind this feature.
const ADMIN_OWNER = (0, auth_1.requireRole)("admin", "owner");
// Term dates (not the slots/events management) are also readable by
// parents, so they can see when each term starts/ends without any of the
// scheduling capability admin/owner get.
const VIEW_TERMS = (0, auth_1.requireRole)("admin", "owner", "parent");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isNonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const getClassSchoolId = async (classId) => {
    const [rows] = await db_1.pool.query("SELECT school_id FROM classes WHERE id = ?", [classId]);
    return rows[0]?.school_id ?? null;
};
const validateTeacher = async (teacherId, schoolId) => {
    const [rows] = await db_1.pool.query(`SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.school_id = ? AND r.name = 'teacher'`, [teacherId, schoolId]);
    return rows.length > 0;
};
const validateSlotBody = (body) => {
    if (!DATE_RE.test(body.slot_date || ""))
        return "slot_date is required, in YYYY-MM-DD format";
    if (!TIME_RE.test(body.start_time || "") || !TIME_RE.test(body.end_time || "")) {
        return "start_time and end_time are required, in HH:MM format";
    }
    if (body.end_time <= body.start_time)
        return "end_time must be after start_time";
    return null;
};
const validateTerm = async (termId, schoolId) => {
    const [rows] = await db_1.pool.query("SELECT 1 FROM school_terms WHERE id = ? AND school_id = ?", [termId, schoolId]);
    return rows.length > 0;
};
// The term a slot belongs to is never chosen directly — it's derived from
// slot_date, so a slot always lands in whichever term's date range
// actually contains it. Returns null if no term at this school covers the
// date (the caller must create one first).
const resolveTermForDate = async (schoolId, slotDate) => {
    const [rows] = await db_1.pool.query(`SELECT id FROM school_terms WHERE school_id = ? AND start_date <= ? AND end_date >= ? ORDER BY start_date ASC LIMIT 1`, [schoolId, slotDate, slotDate]);
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
router.get("/terms", auth_1.authMiddleware, VIEW_TERMS, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const [rows] = await db_1.pool.query("SELECT id, name, start_date, end_date FROM school_terms WHERE school_id = ? ORDER BY start_date ASC", [req.user.schoolId]);
    res.json({ terms: rows });
}));
/* ============================================================
   CREATE A SCHOOL TERM — ADMIN, OWNER
   ============================================================ */
router.post("/terms", auth_1.authMiddleware, ADMIN_OWNER, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { name, start_date, end_date } = req.body;
    if (!isNonEmpty(name))
        return res.status(400).json({ message: "Term name is required" });
    if (!isNonEmpty(start_date) || !isNonEmpty(end_date)) {
        return res.status(400).json({ message: "Start date and end date are required" });
    }
    if (String(end_date) < String(start_date)) {
        return res.status(400).json({ message: "End date must be on or after the start date" });
    }
    let result;
    try {
        [result] = await db_1.pool.query("INSERT INTO school_terms (school_id, name, start_date, end_date) VALUES (?, ?, ?, ?)", [req.user.schoolId, String(name).trim(), start_date, end_date]);
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
            throw new httpError_1.HttpError(409, "A term with this name already exists");
        }
        throw err;
    }
    res.status(201).json({
        message: "Term created",
        term: { id: result.insertId, name: String(name).trim(), start_date, end_date }
    });
}));
/* ============================================================
   LIST EVERY CLASS'S TIMETABLE SLOTS FOR ONE TERM — SCHOOL-WIDE CALENDAR
   Powers the weekly grid: every class's slots at once for a given term,
   so admin/owner can see what's scheduled when across the whole school,
   not one class at a time. term_id is required — schedules are scoped to
   a term, so there's no single well-defined "all slots" view.
   ============================================================ */
router.get("/slots", auth_1.authMiddleware, ADMIN_OWNER, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!(await (0, featureFlags_1.isFeatureEnabled)("timetable", req.user.schoolId))) {
        return res.status(403).json({ message: "The timetable feature is currently disabled for this school" });
    }
    const termId = Number(req.query.term_id);
    if (!termId)
        return res.status(400).json({ message: "term_id query parameter is required" });
    if (!(await validateTerm(termId, req.user.schoolId))) {
        return res.status(400).json({ message: "Unknown term for this school" });
    }
    const [rows] = await db_1.pool.query(`SELECT ts.id, ts.class_id, c.class_name, ts.term_id, ts.slot_date, ts.start_time, ts.end_time,
              ts.subject_name, ts.teacher_id,
              COALESCE(sd.first_name, '') AS teacher_first_name,
              COALESCE(sd.surname, '') AS teacher_surname
       FROM timetable_slots ts
       JOIN classes c ON c.id = ts.class_id
       LEFT JOIN staff_details sd ON sd.user_id = ts.teacher_id
       WHERE c.school_id = ? AND ts.term_id = ?
       ORDER BY ts.slot_date, ts.start_time`, [req.user.schoolId, termId]);
    res.json({ slots: rows });
}));
/* ============================================================
   LIST A CLASS'S TIMETABLE SLOTS FOR ONE TERM
   term_id is optional — omit it to see every one of this class's slots
   across every term.
   ============================================================ */
router.get("/classes/:classId/slots", auth_1.authMiddleware, ADMIN_OWNER, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classId = Number(req.params.classId);
    const schoolId = await getClassSchoolId(classId);
    if (schoolId === null)
        return res.status(404).json({ message: "Class not found" });
    if (schoolId !== req.user.schoolId)
        return res.status(403).json({ message: "You do not have access to this class" });
    if (!(await (0, featureFlags_1.isFeatureEnabled)("timetable", schoolId))) {
        return res.status(403).json({ message: "The timetable feature is currently disabled for this school" });
    }
    const params = [classId];
    let termFilter = "";
    if (req.query.term_id) {
        const termId = Number(req.query.term_id);
        if (!(await validateTerm(termId, schoolId))) {
            return res.status(400).json({ message: "Unknown term for this school" });
        }
        termFilter = "AND ts.term_id = ?";
        params.push(termId);
    }
    const [rows] = await db_1.pool.query(`SELECT ts.id, ts.term_id, t.name AS term_name, ts.slot_date, ts.start_time, ts.end_time, ts.subject_name, ts.teacher_id,
              COALESCE(sd.first_name, '') AS teacher_first_name,
              COALESCE(sd.surname, '') AS teacher_surname
       FROM timetable_slots ts
       JOIN school_terms t ON t.id = ts.term_id
       LEFT JOIN staff_details sd ON sd.user_id = ts.teacher_id
       WHERE ts.class_id = ? ${termFilter}
       ORDER BY ts.slot_date, ts.start_time`, params);
    res.json({ slots: rows });
}));
/* ============================================================
   CREATE A TIMETABLE SLOT FOR A CLASS
   The term is never chosen directly — it's resolved from slot_date.
   ============================================================ */
router.post("/classes/:classId/slots", auth_1.authMiddleware, ADMIN_OWNER, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classId = Number(req.params.classId);
    const schoolId = await getClassSchoolId(classId);
    if (schoolId === null)
        return res.status(404).json({ message: "Class not found" });
    if (schoolId !== req.user.schoolId)
        return res.status(403).json({ message: "You do not have access to this class" });
    if (!(await (0, featureFlags_1.isFeatureEnabled)("timetable", schoolId))) {
        return res.status(403).json({ message: "The timetable feature is currently disabled for this school" });
    }
    const validationError = validateSlotBody(req.body);
    if (validationError)
        return res.status(400).json({ message: validationError });
    const { slot_date, start_time, end_time, subject_name, teacher_id } = req.body;
    const termId = await resolveTermForDate(schoolId, slot_date);
    if (!termId) {
        return res.status(400).json({ message: "No term covers this date — create one in the Terms section first" });
    }
    if (teacher_id && !(await validateTeacher(teacher_id, schoolId))) {
        return res.status(400).json({ message: "teacher_id must be a teacher at this school" });
    }
    let result;
    try {
        [result] = await db_1.pool.query(`INSERT INTO timetable_slots (class_id, term_id, slot_date, start_time, end_time, subject_name, teacher_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`, [classId, termId, slot_date, start_time, end_time, isNonEmpty(subject_name) ? String(subject_name).trim() : null, teacher_id || null]);
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
            throw new httpError_1.HttpError(409, "A slot already exists for this class, date and start time");
        }
        throw err;
    }
    res.status(201).json({ message: "Timetable slot created", slot: { id: result.insertId, term_id: termId } });
}));
/* ============================================================
   EDIT A TIMETABLE SLOT
   Moving slot_date can move it into a different term — re-resolved the
   same way as creation.
   ============================================================ */
router.put("/slots/:id", auth_1.authMiddleware, ADMIN_OWNER, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const slotId = Number(req.params.id);
    const [rows] = await db_1.pool.query(`SELECT ts.id, ts.class_id, c.school_id FROM timetable_slots ts JOIN classes c ON c.id = ts.class_id WHERE ts.id = ?`, [slotId]);
    const slot = rows[0];
    if (!slot)
        return res.status(404).json({ message: "Timetable slot not found" });
    if (slot.school_id !== req.user.schoolId)
        return res.status(403).json({ message: "You do not have access to this class" });
    if (!(await (0, featureFlags_1.isFeatureEnabled)("timetable", slot.school_id))) {
        return res.status(403).json({ message: "The timetable feature is currently disabled for this school" });
    }
    const validationError = validateSlotBody(req.body);
    if (validationError)
        return res.status(400).json({ message: validationError });
    const { slot_date, start_time, end_time, subject_name, teacher_id } = req.body;
    const termId = await resolveTermForDate(slot.school_id, slot_date);
    if (!termId) {
        return res.status(400).json({ message: "No term covers this date — create one in the Terms section first" });
    }
    if (teacher_id && !(await validateTeacher(teacher_id, slot.school_id))) {
        return res.status(400).json({ message: "teacher_id must be a teacher at this school" });
    }
    try {
        await db_1.pool.query(`UPDATE timetable_slots
         SET term_id = ?, slot_date = ?, start_time = ?, end_time = ?, subject_name = ?, teacher_id = ?
         WHERE id = ?`, [termId, slot_date, start_time, end_time, isNonEmpty(subject_name) ? String(subject_name).trim() : null, teacher_id || null, slotId]);
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
            throw new httpError_1.HttpError(409, "A slot already exists for this class, date and start time");
        }
        throw err;
    }
    res.json({ message: "Timetable slot updated" });
}));
/* ============================================================
   DELETE A TIMETABLE SLOT
   ============================================================ */
router.delete("/slots/:id", auth_1.authMiddleware, ADMIN_OWNER, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const slotId = Number(req.params.id);
    const [rows] = await db_1.pool.query(`SELECT ts.id, c.school_id FROM timetable_slots ts JOIN classes c ON c.id = ts.class_id WHERE ts.id = ?`, [slotId]);
    const slot = rows[0];
    if (!slot)
        return res.status(404).json({ message: "Timetable slot not found" });
    if (slot.school_id !== req.user.schoolId)
        return res.status(403).json({ message: "You do not have access to this class" });
    if (!(await (0, featureFlags_1.isFeatureEnabled)("timetable", slot.school_id))) {
        return res.status(403).json({ message: "The timetable feature is currently disabled for this school" });
    }
    await db_1.pool.query("DELETE FROM timetable_slots WHERE id = ?", [slotId]);
    res.json({ message: "Timetable slot deleted" });
}));
/* ============================================================
   LIST SCHOOL EVENTS — ADMIN, OWNER
   Not gated by the flag itself (like report-cards' GET /terms): dashboards
   fetch this unconditionally on load, so gating it would 403 the whole
   dashboard for any school that hasn't turned the flag on yet. The flag
   instead controls whether the Timetable nav item/section is shown at
   all, and gates every write below.
   ============================================================ */
router.get("/events", auth_1.authMiddleware, ADMIN_OWNER, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const [rows] = await db_1.pool.query(`SELECT id, title, description, event_date, start_time, end_time, created_at
       FROM school_events
       WHERE school_id = ?
       ORDER BY event_date ASC, start_time ASC`, [req.user.schoolId]);
    res.json({ events: rows });
}));
/* ============================================================
   CREATE A SCHOOL EVENT
   ============================================================ */
router.post("/events", auth_1.authMiddleware, ADMIN_OWNER, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!(await (0, featureFlags_1.isFeatureEnabled)("timetable", req.user.schoolId))) {
        return res.status(403).json({ message: "The timetable feature is currently disabled for this school" });
    }
    const { title, description, event_date, start_time, end_time } = req.body;
    if (!isNonEmpty(title))
        return res.status(400).json({ message: "Title is required" });
    if (!isNonEmpty(event_date))
        return res.status(400).json({ message: "event_date is required" });
    if (start_time && !TIME_RE.test(start_time))
        return res.status(400).json({ message: "start_time must be in HH:MM format" });
    if (end_time && !TIME_RE.test(end_time))
        return res.status(400).json({ message: "end_time must be in HH:MM format" });
    if (start_time && end_time && end_time <= start_time) {
        return res.status(400).json({ message: "end_time must be after start_time" });
    }
    const [result] = await db_1.pool.query(`INSERT INTO school_events (school_id, title, description, event_date, start_time, end_time, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        req.user.schoolId,
        String(title).trim(),
        description ? String(description).trim() : null,
        event_date,
        start_time || null,
        end_time || null,
        req.user.userId
    ]);
    res.status(201).json({ message: "Event created", event: { id: result.insertId } });
}));
/* ============================================================
   EDIT A SCHOOL EVENT
   ============================================================ */
router.put("/events/:id", auth_1.authMiddleware, ADMIN_OWNER, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const eventId = Number(req.params.id);
    const [rows] = await db_1.pool.query("SELECT id, school_id FROM school_events WHERE id = ?", [eventId]);
    const event = rows[0];
    if (!event)
        return res.status(404).json({ message: "Event not found" });
    if (event.school_id !== req.user.schoolId)
        return res.status(403).json({ message: "You do not have access to this event" });
    if (!(await (0, featureFlags_1.isFeatureEnabled)("timetable", event.school_id))) {
        return res.status(403).json({ message: "The timetable feature is currently disabled for this school" });
    }
    const { title, description, event_date, start_time, end_time } = req.body;
    if (!isNonEmpty(title))
        return res.status(400).json({ message: "Title is required" });
    if (!isNonEmpty(event_date))
        return res.status(400).json({ message: "event_date is required" });
    if (start_time && !TIME_RE.test(start_time))
        return res.status(400).json({ message: "start_time must be in HH:MM format" });
    if (end_time && !TIME_RE.test(end_time))
        return res.status(400).json({ message: "end_time must be in HH:MM format" });
    if (start_time && end_time && end_time <= start_time) {
        return res.status(400).json({ message: "end_time must be after start_time" });
    }
    await db_1.pool.query(`UPDATE school_events
       SET title = ?, description = ?, event_date = ?, start_time = ?, end_time = ?
       WHERE id = ?`, [String(title).trim(), description ? String(description).trim() : null, event_date, start_time || null, end_time || null, eventId]);
    res.json({ message: "Event updated" });
}));
/* ============================================================
   DELETE A SCHOOL EVENT
   ============================================================ */
router.delete("/events/:id", auth_1.authMiddleware, ADMIN_OWNER, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const eventId = Number(req.params.id);
    const [rows] = await db_1.pool.query("SELECT id, school_id FROM school_events WHERE id = ?", [eventId]);
    const event = rows[0];
    if (!event)
        return res.status(404).json({ message: "Event not found" });
    if (event.school_id !== req.user.schoolId)
        return res.status(403).json({ message: "You do not have access to this event" });
    if (!(await (0, featureFlags_1.isFeatureEnabled)("timetable", event.school_id))) {
        return res.status(403).json({ message: "The timetable feature is currently disabled for this school" });
    }
    await db_1.pool.query("DELETE FROM school_events WHERE id = ?", [eventId]);
    res.json({ message: "Event deleted" });
}));
exports.default = router;
