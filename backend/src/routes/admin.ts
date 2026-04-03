import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.post('/classes', async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Class name is required' });
  }

  await pool.execute(
    'INSERT INTO classes (name, description) VALUES (?, ?)',
    [name, description]
  );

  res.json({ message: 'Class created' });
});

router.post('/users/:id/grant-teacher', async (req, res) => {
  const userId = req.params.id;

  await pool.execute(
    "UPDATE users SET role = 'teacher' WHERE id = ?",
    [userId]
  );

  res.json({ message: 'Teacher role granted' });
});

router.get('/users', async (_req, res) => {
  const [rows] = await pool.execute(
    "SELECT id, full_name, email, role FROM users WHERE role IN ('teacher','student')"
  );

  res.json(rows);
});

export default router;
