import { Hono } from "hono";
import type { AppEnv } from "../types/env";
import type { Context } from "hono";
import { authMiddleware, requireRole } from "../middleware/auth";
import { isFeatureEnabled } from "../utils/featureFlags";

const router = new Hono<AppEnv>();

interface IdRow {
  id: number;
}

// Same senders as class/staff management (admin.ts's STAFF_MGMT) — system_admin
// has no school of its own, so it must name one explicitly, same as when it
// creates a class.
const SENDERS = requireRole("admin", "owner", "system_admin");
const isPlatformWide = (c: Context<AppEnv>) => c.get("user")!.role === "system_admin";

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
router.post("/", authMiddleware, SENDERS, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const body = await c.req.json();
  const { audience, title, message } = body;
  const schoolId = isPlatformWide(c) ? body.school_id : user.schoolId;

  if (!AUDIENCES.includes(audience)) {
    return c.json({ message: "Audience must be 'parent' or 'staff'" }, 400);
  }
  if (!title || !String(title).trim()) {
    return c.json({ message: "Title is required" }, 400);
  }
  if (!message || !String(message).trim()) {
    return c.json({ message: "Message is required" }, 400);
  }
  if (!schoolId) {
    return c.json({ message: "School is required" }, 400);
  }

  if (!(await isFeatureEnabled(db, "notifications", schoolId))) {
    return c.json({ message: "The notifications feature is currently disabled for this school" }, 403);
  }

  const roleNames = audienceRoleNames(audience);
  const { rows: recipientRows } = await db.query<IdRow>(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.school_id = $1 AND r.name = ANY($2)`,
    [schoolId, roleNames]
  );
  const recipientIds = recipientRows.map(r => r.id);

  // There's already exactly one connection for the whole request (unlike
  // the old pooled version, which had to check out a separate connection
  // via pool.getConnection() specifically to keep the transaction on one
  // socket) — begin/commit/rollback run directly on it.
  try {
    await db.query("BEGIN");

    const {
      rows: [result]
    } = await db.query<IdRow>(
      `INSERT INTO notifications (school_id, sender_user_id, audience, title, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [schoolId, user.userId, audience, String(title).trim(), String(message).trim()]
    );
    const notificationId = result.id;

    if (recipientIds.length > 0) {
      const groups = recipientIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
      const flatParams = recipientIds.flatMap(id => [notificationId, id]);
      await db.query(`INSERT INTO notification_recipients (notification_id, user_id) VALUES ${groups}`, flatParams);
    }

    await db.query("COMMIT");
    return c.json({ message: "Notification sent", recipientCount: recipientIds.length }, 201);
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
});

/* ============================================================
   SENT NOTIFICATIONS (HISTORY) — SENDERS ONLY
   ============================================================ */
router.get("/sent", authMiddleware, SENDERS, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const params: any[] = [];
  let where = "";
  if (!isPlatformWide(c)) {
    where = "WHERE n.school_id = $1";
    params.push(user.schoolId);
  }

  const { rows } = await db.query(
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

  return c.json(rows);
});

/* ============================================================
   MY NOTIFICATIONS (ANY AUTHENTICATED USER)
   Gated the same as sending — this is a slow, per-school rollout, so a
   school with the flag off shouldn't see any notifications UI at all,
   inbox included, not just the ability to send.
   ============================================================ */
router.get("/", authMiddleware, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  if (!(await isFeatureEnabled(db, "notifications", user.schoolId))) {
    return c.json([]);
  }

  const { rows } = await db.query(
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
     WHERE nr.user_id = $1
     ORDER BY n.created_at DESC`,
    [user.userId]
  );

  return c.json(rows);
});

/* ============================================================
   MARK A NOTIFICATION AS READ
   ============================================================ */
router.post("/:id/read", authMiddleware, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  if (!(await isFeatureEnabled(db, "notifications", user.schoolId))) {
    return c.json({ message: "The notifications feature is currently disabled for this school" }, 403);
  }

  const id = c.req.param("id");
  const { rowCount } = await db.query(
    `UPDATE notification_recipients
     SET read_at = NOW()
     WHERE notification_id = $1 AND user_id = $2 AND read_at IS NULL`,
    [id, user.userId]
  );

  if (rowCount === 0) {
    const { rows: existing } = await db.query(
      `SELECT 1 FROM notification_recipients WHERE notification_id = $1 AND user_id = $2`,
      [id, user.userId]
    );
    if (existing.length === 0) {
      return c.json({ message: "Notification not found" }, 404);
    }
  }

  return c.json({ message: "Marked as read" });
});

export default router;
