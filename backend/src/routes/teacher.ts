import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireRole('teacher'));

router.get('/classes', async (req: AuthRequest, res) => {
  const teacherId = req.user!.id;

  const [rows] = await pool.execute(
    `SELECT c.id, c.name, c.description
     FROM classes c
     JOIN class_teachers ct ON c.id = ct.class_id
     WHERE ct.teacher_id = ?`,
    [teacherId]
  );

  res.json(rows);
});

router.get('/classes/:classId/students', async (req, res) => {
  const { classId } = req.params;

  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name, u.email
     FROM users u
     JOIN class_students cs ON u.id = cs.student_id
     WHERE cs.class_id = ?`,
    [classId]
  );

  res.json(rows);
});

router.post('/classes/:classId/attendance', async (req, res) => {
  const { classId } = req.params;
  const { date, records } = req.body;

  if (!date || !Array.isArray(records)) {
    return res.status(400).json({ message: 'Date and records are required' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    for (const r of records) {
      await conn.execute(
        `INSERT INTO attendance (class_id, student_id, date, present)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE present = VALUES(present)`,
        [classId, r.studentId, date, r.present]
      );
    }

    await conn.commit();
    res.json({ message: 'Attendance recorded' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Failed to record attendance' });
  } finally {
    conn.release();
  }
});

export default router;
