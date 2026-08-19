import { Router } from "express";
import { pool } from "../config/db";
import { authMiddleware } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/auth";

const router = Router();

/* ============================================================
   GET CHILDREN FOR LOGGED-IN PARENT
   ============================================================ */
router.get("/children", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;

    const [parentRows] = await pool.query(
      "SELECT id FROM parents WHERE user_id = ?",
      [userId]
    );

    const parent = (parentRows as any)[0];
    if (!parent) return res.json({ children: [] });

    const [children] = await pool.query(
      `SELECT 
         id,
         first_name,
         surname,
         gender,
         date_of_birth
       FROM students
       WHERE parent_id = ?`,
      [parent.id]
    );

    res.json({ children });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load children" });
  }
});

/* ============================================================
   ADD CHILD FOR LOGGED-IN PARENT
   ============================================================ */
router.post("/add-child", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
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

      const [studentResult] = await conn.query(
        `
        INSERT INTO students
        (parent_id, school_id, first_name, middle_name, surname, gender, date_of_birth,
         address1, address2, address3, city, postcode, medical_condition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          parent.id,
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
          medical_condition
        ]
      );

      const studentId = (studentResult as any).insertId;
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
      SELECT id, first_name, surname, gender, date_of_birth
      FROM students
      WHERE parent_id = ?
      ORDER BY id DESC
      `,
      [parent.id]
    );

    res.json({
      message: "Child added successfully",
      children
    });
  } catch (err) {
    console.error("Add child error:", err);
    res.status(500).json({ message: "Failed to add child" });
  }
});

/* ============================================================
   GET TASKS FOR ALL CHILDREN OF LOGGED-IN PARENT
   ============================================================ */
router.get("/tasks", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
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
       WHERE s.parent_id = ? AND (t.student_id IS NULL OR t.student_id = s.id)
       ORDER BY t.due_date ASC`,
      [parent.id]
    );

    res.json({ tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load tasks" });
  }
});

export default router;
