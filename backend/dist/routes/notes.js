"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../config/db");
const auth_1 = require("../middleware/auth");
const featureFlags_1 = require("../utils/featureFlags");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
// Same "staff" grouping notifications uses for its staff audience — everyone
// who works at the school. Parents get access separately below, scoped to
// their own children only. Students and system_admin are deliberately
// excluded: these notes are about a student, not for them, and system_admin
// has no single school to be "staff" in.
const STAFF_ROLES = ["teacher", "staff", "admin", "owner", "maintainer", "treasurer"];
const loadStudent = async (studentId) => {
    const [rows] = await db_1.pool.query("SELECT id, school_id FROM students WHERE id = ?", [studentId]);
    return rows[0] || null;
};
const isOwnChild = async (userId, studentId) => {
    const [rows] = await db_1.pool.query(`SELECT 1 FROM student_guardians sg
     JOIN parents p ON p.id = sg.parent_id
     WHERE sg.student_id = ? AND p.user_id = ? AND sg.status = 'approved'`, [studentId, userId]);
    return rows.length > 0;
};
const teachesStudent = async (teacherId, studentId) => {
    const [rows] = await db_1.pool.query(`SELECT 1 FROM student_classes sc
     JOIN teacher_classes tc ON tc.class_id = sc.class_id
     WHERE sc.student_id = ? AND tc.teacher_id = ?`, [studentId, teacherId]);
    return rows.length > 0;
};
/* ============================================================
   GET NOTES FOR A STUDENT
   Staff (same school) or the student's own parent. Never the student.
   ============================================================ */
router.get("/students/:studentId", auth_1.authMiddleware, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentId = Number(req.params.studentId);
    const student = await loadStudent(studentId);
    if (!student)
        return res.status(404).json({ message: "Student not found" });
    if (!(await (0, featureFlags_1.isFeatureEnabled)("student_notes", student.school_id))) {
        return res.status(403).json({ message: "Student notes are currently disabled for this school" });
    }
    const role = req.user.role;
    const allowed = STAFF_ROLES.includes(role)
        ? req.user.schoolId === student.school_id
        : role === "parent"
            ? await isOwnChild(req.user.userId, student.id)
            : false;
    if (!allowed) {
        return res.status(403).json({ message: "You do not have access to this student's notes" });
    }
    const [rows] = await db_1.pool.query(`SELECT
         n.id,
         n.note,
         n.created_at,
         COALESCE(sd.first_name, '') AS author_first_name,
         COALESCE(sd.surname, '') AS author_last_name
       FROM student_notes n
       LEFT JOIN staff_details sd ON sd.user_id = n.author_user_id
       WHERE n.student_id = ?
       ORDER BY n.created_at DESC`, [studentId]);
    res.json({ notes: rows });
}));
/* ============================================================
   ADD A NOTE FOR A STUDENT — STAFF ONLY
   Teachers are further restricted to students in one of their own classes,
   matching this feature's entry point on the attendance page.
   ============================================================ */
router.post("/students/:studentId", auth_1.authMiddleware, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const role = req.user.role;
    if (!STAFF_ROLES.includes(role)) {
        return res.status(403).json({ message: "Forbidden" });
    }
    const studentId = Number(req.params.studentId);
    const { note } = req.body;
    if (!note || !String(note).trim()) {
        return res.status(400).json({ message: "Note text is required" });
    }
    const student = await loadStudent(studentId);
    if (!student)
        return res.status(404).json({ message: "Student not found" });
    if (!(await (0, featureFlags_1.isFeatureEnabled)("student_notes", student.school_id))) {
        return res.status(403).json({ message: "Student notes are currently disabled for this school" });
    }
    if (student.school_id !== req.user.schoolId) {
        return res.status(403).json({ message: "You do not have access to this student" });
    }
    if (role === "teacher" && !(await teachesStudent(req.user.userId, studentId))) {
        return res.status(403).json({ message: "You are not assigned to this student's class" });
    }
    await db_1.pool.query(`INSERT INTO student_notes (student_id, author_user_id, note) VALUES (?, ?, ?)`, [studentId, req.user.userId, String(note).trim()]);
    res.status(201).json({ message: "Note added" });
}));
exports.default = router;
