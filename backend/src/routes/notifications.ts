import { Router } from "express";
import { pool } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/auth";
import { isFeatureEnabled } from "../utils/featureFlags";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Same senders as class/staff management (admin.ts's STAFF_MGMT) — system_admin
// has no school of its own, so it must name one explicitly, same as when it
// creates a class.
const SENDERS = requireRole("admin", "owner", "system_admin");
const isPlatformWide = (req: AuthenticatedRequest) => req.user!.role === "system_admin";

const AUDIENCES = ["parent", "staff"] as const;
type Audience = (typeof AUDIENCES)[number];

// "Staff" covers everyone who works at the school — teachers, general staff,
// and school leadership (admin/owner/maintainer). system_admin is excluded:
// it's a platform-level role with no single school to be a recipient in.
const audienceRoleNames = (audience: Audience) =>
  audience === "parent" ? ["parent"] : ["teacher", "staff", "admin", "owner", "maintainer", "treasurer"];

/* ============================================================
   SEND A NOTIFICATION
   ============================================================ */
router.post(
  "/",
  authMiddleware,
  SENDERS,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { audience, title, message } = req.body;
    const schoolId = isPlatformWide(req) ? req.body.school_id : req.user!.schoolId;

    if (!AUDIENCES.includes(audience)) {
      return res.status(400).json({ message: "Audience must be 'parent' or 'staff'" });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Title is required" });
    }
    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: "Message is required" });
    }
    if (!schoolId) {
      return res.status(400).json({ message: "School is required" });
    }

    if (!(await isFeatureEnabled("notifications", schoolId))) {
      return res.status(403).json({ message: "The notifications feature is currently disabled for this school" });
    }

    const roleNames = audienceRoleNames(audience);
    const [recipientRows] = await pool.query(
      `SELECT u.id
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.school_id = ? AND r.name IN (?)`,
      [schoolId, roleNames]
    );
    const recipientIds = (recipientRows as any[]).map(r => r.id);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO notifications (school_id, sender_user_id, audience, title, message)
         VALUES (?, ?, ?, ?, ?)`,
        [schoolId, req.user!.userId, audience, String(title).trim(), String(message).trim()]
      );
      const notificationId = (result as any).insertId;

      if (recipientIds.length > 0) {
        const values = recipientIds.map(id => [notificationId, id]);
        await conn.query(
          `INSERT INTO notification_recipients (notification_id, user_id) VALUES ?`,
          [values]
        );
      }

      await conn.commit();
      res.status(201).json({ message: "Notification sent", recipientCount: recipientIds.length });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

/* ============================================================
   SENT NOTIFICATIONS (HISTORY) — SENDERS ONLY
   ============================================================ */
router.get(
  "/sent",
  authMiddleware,
  SENDERS,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const params: any[] = [];
    let where = "";
    if (!isPlatformWide(req)) {
      where = "WHERE n.school_id = ?";
      params.push(req.user!.schoolId);
    }

    const [rows] = await pool.query(
      `SELECT
         n.id,
         n.audience,
         n.title,
         n.message,
         n.created_at,
         MAX(sc.name) AS school_name,
         COALESCE(MAX(sd.first_name), '') AS sender_first_name,
         COALESCE(MAX(sd.surname), '') AS sender_last_name,
         COUNT(nr.user_id) AS recipient_count
       FROM notifications n
       JOIN schools sc ON sc.id = n.school_id
       LEFT JOIN staff_details sd ON sd.user_id = n.sender_user_id
       LEFT JOIN notification_recipients nr ON nr.notification_id = n.id
       ${where}
       GROUP BY n.id
       ORDER BY n.created_at DESC`,
      params
    );

    res.json(rows);
  })
);

/* ============================================================
   MY NOTIFICATIONS (ANY AUTHENTICATED USER)
   Gated the same as sending — this is a slow, per-school rollout, so a
   school with the flag off shouldn't see any notifications UI at all,
   inbox included, not just the ability to send.
   ============================================================ */
router.get(
  "/",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!(await isFeatureEnabled("notifications", req.user!.schoolId))) {
      return res.json([]);
    }

    const [rows] = await pool.query(
      `SELECT
         n.id,
         n.audience,
         n.title,
         n.message,
         n.created_at,
         nr.read_at,
         COALESCE(sd.first_name, '') AS sender_first_name,
         COALESCE(sd.surname, '') AS sender_last_name
       FROM notification_recipients nr
       JOIN notifications n ON n.id = nr.notification_id
       LEFT JOIN staff_details sd ON sd.user_id = n.sender_user_id
       WHERE nr.user_id = ?
       ORDER BY n.created_at DESC`,
      [req.user!.userId]
    );

    res.json(rows);
  })
);

/* ============================================================
   MARK A NOTIFICATION AS READ
   ============================================================ */
router.post(
  "/:id/read",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!(await isFeatureEnabled("notifications", req.user!.schoolId))) {
      return res.status(403).json({ message: "The notifications feature is currently disabled for this school" });
    }

    const [result] = await pool.query(
      `UPDATE notification_recipients
       SET read_at = NOW()
       WHERE notification_id = ? AND user_id = ? AND read_at IS NULL`,
      [req.params.id, req.user!.userId]
    );

    if ((result as any).affectedRows === 0) {
      const [existing] = await pool.query(
        `SELECT 1 FROM notification_recipients WHERE notification_id = ? AND user_id = ?`,
        [req.params.id, req.user!.userId]
      );
      if ((existing as any[]).length === 0) {
        return res.status(404).json({ message: "Notification not found" });
      }
    }

    res.json({ message: "Marked as read" });
  })
);

export default router;
