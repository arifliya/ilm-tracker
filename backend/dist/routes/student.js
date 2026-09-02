"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../config/db");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
const STUDENT_ONLY = (0, auth_1.requireRole)("student");
// GET classes student is enrolled in
router.get("/classes", auth_1.authMiddleware, STUDENT_ONLY, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentUserId = req.user.userId;
    const [rows] = await db_1.pool.query(`SELECT c.id, c.class_name, c.year_group
       FROM students s
       JOIN student_classes sc ON sc.student_id = s.id
       JOIN classes c ON c.id = sc.class_id
       WHERE s.user_id = ?`, [studentUserId]);
    res.json({ classes: rows });
}));
// GET tasks assigned to student's class
router.get("/tasks", auth_1.authMiddleware, STUDENT_ONLY, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentUserId = req.user.userId;
    const [rows] = await db_1.pool.query(`SELECT t.id, t.title, t.description, t.due_date, c.class_name,
              t.student_id IS NOT NULL AS is_independent
       FROM tasks t
       JOIN classes c ON t.class_id = c.id
       JOIN student_classes sc ON sc.class_id = c.id
       JOIN students s ON s.id = sc.student_id
       WHERE s.user_id = ? AND (t.student_id IS NULL OR t.student_id = s.id)`, [studentUserId]);
    res.json({ tasks: rows });
}));
exports.default = router;
