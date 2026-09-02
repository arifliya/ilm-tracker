import { Router } from "express";
import { pool } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const STUDENT_ONLY = requireRole("student");

// GET classes student is enrolled in
router.get(
  "/classes",
  authMiddleware,
  STUDENT_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const studentUserId = req.user!.userId;

    const [rows] = await pool.query(
      `SELECT c.id, c.class_name, c.year_group
       FROM students s
       JOIN student_classes sc ON sc.student_id = s.id
       JOIN classes c ON c.id = sc.class_id
       WHERE s.user_id = ?`,
      [studentUserId]
    );

    res.json({ classes: rows });
  })
);

// GET tasks assigned to student's class
router.get(
  "/tasks",
  authMiddleware,
  STUDENT_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const studentUserId = req.user!.userId;

    const [rows] = await pool.query(
      `SELECT t.id, t.title, t.description, t.due_date, c.class_name,
              t.student_id IS NOT NULL AS is_independent
       FROM tasks t
       JOIN classes c ON t.class_id = c.id
       JOIN student_classes sc ON sc.class_id = c.id
       JOIN students s ON s.id = sc.student_id
       WHERE s.user_id = ? AND (t.student_id IS NULL OR t.student_id = s.id)`,
      [studentUserId]
    );

    res.json({ tasks: rows });
  })
);

export default router;
