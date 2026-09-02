import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { pool } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/auth";
import { resetExpiredFeatureFlags, isFeatureEnabled } from "../utils/featureFlags";
import { generateTemporaryPassword } from "../utils/tempPassword";
import { env } from "../config/env";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../utils/httpError";

const router = Router();

const SYSTEM_ADMIN_ONLY = requireRole("system_admin");

// Same skip-under-Jest convention as admin.ts's resetPasswordLimiter.
const isTestEnv = () => env.NODE_ENV === "test";

// Mirrors admin.ts's resetPasswordLimiter — same abuse-prevention reasoning,
// kept as its own limiter here since this endpoint lives in a different
// router with a much narrower target (owner accounts only).
const resetOwnerPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: { message: "Too many password resets. Please try again later." }
});

const KEY_RE = /^[a-z][a-z0-9_]{1,79}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

const normalizeDatetime = (value: string) => {
  const withSpace = value.replace("T", " ");
  return withSpace.length === 16 ? `${withSpace}:00` : withSpace;
};

const SCHOOL_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids ambiguous codes

const generateSchoolCode = () => {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += SCHOOL_CODE_CHARS[Math.floor(Math.random() * SCHOOL_CODE_CHARS.length)];
  }
  return code;
};

// One insert per feature-flag mutation (create/update/delete a flag, set/
// clear a per-school override) so system_admin actions stay reconstructable
// after the fact — feature_key is captured here rather than joined later so
// the log stays readable even once the flag itself is gone.
const logFeatureFlagAudit = async (entry: {
  featureFlagId: number | null;
  featureKey: string;
  schoolId?: number | null;
  action: string;
  actorUserId: number;
  details?: Record<string, unknown>;
}) => {
  await pool.query(
    `INSERT INTO feature_flag_audit_log
       (feature_flag_id, feature_key, school_id, action, actor_user_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.featureFlagId,
      entry.featureKey,
      entry.schoolId ?? null,
      entry.action,
      entry.actorUserId,
      entry.details ? JSON.stringify(entry.details) : null
    ]
  );
};

/* ============================================================
   LIST SCHOOLS
   ============================================================ */
router.get(
  "/schools",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query(
      `SELECT id, name, school_code, created_at FROM schools ORDER BY name ASC`
    );
    res.json(rows);
  })
);

/* ============================================================
   CREATE SCHOOL (generates a unique school_code)
   ============================================================ */
router.post(
  "/schools",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "School name is required" });
    }

    let code = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateSchoolCode();
      const [existing] = await pool.query("SELECT id FROM schools WHERE school_code = ?", [candidate]);
      if ((existing as any[]).length === 0) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw new HttpError(500, "Failed to generate a unique school code, try again");
    }

    await pool.query(
      `INSERT INTO schools (name, school_code) VALUES (?, ?)`,
      [name, code]
    );

    res.status(201).json({ message: "School created", school_code: code });
  })
);

/* ============================================================
   LIST FEATURE FLAGS + PER-SCHOOL OVERRIDES
   Returns the flag catalog, every school, and the explicit overrides that
   exist — the caller derives each school's effective state as
   override.enabled if one exists, else the flag's default_enabled.
   ============================================================ */
router.get(
  "/feature-flags",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  asyncHandler(async (_req, res) => {
    await resetExpiredFeatureFlags();

    const [flags] = await pool.query(
      `SELECT id, feature_key, name, description, default_enabled,
              expires_at, created_at, updated_at
       FROM feature_flags
       ORDER BY name ASC`
    );

    const [schools] = await pool.query(
      `SELECT id, name, school_code FROM schools ORDER BY name ASC`
    );

    const [overrides] = await pool.query(
      `SELECT school_id, feature_flag_id, enabled FROM school_feature_flags`
    );

    res.json({ flags, schools, overrides });
  })
);

/* ============================================================
   FEATURE FLAG AUDIT LOG — recent create/update/delete/override actions,
   newest first. Capped at 200 rows; this is an activity feed, not a report.
   ============================================================ */
router.get(
  "/feature-flags/audit-log",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query(
      `SELECT
         l.id,
         l.feature_flag_id,
         l.feature_key,
         l.school_id,
         sc.name AS school_name,
         l.action,
         l.actor_user_id,
         COALESCE(u.username, 'Unknown') AS actor_username,
         l.details,
         l.created_at
       FROM feature_flag_audit_log l
       LEFT JOIN schools sc ON sc.id = l.school_id
       LEFT JOIN users u ON u.id = l.actor_user_id
       ORDER BY l.created_at DESC
       LIMIT 200`
    );

    res.json(rows);
  })
);

/* ============================================================
   CREATE FEATURE FLAG
   ============================================================ */
router.post(
  "/feature-flags",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { feature_key, name, description, default_enabled, expires_at } = req.body;

    const key = String(feature_key || "").trim().toLowerCase();
    if (!KEY_RE.test(key)) {
      return res.status(400).json({
        message: "Feature key must start with a letter and contain only lowercase letters, numbers, or underscores"
      });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (expires_at && !DATETIME_RE.test(String(expires_at))) {
      return res.status(400).json({ message: "Invalid expiry date format" });
    }

    const [existing] = await pool.query("SELECT id FROM feature_flags WHERE feature_key = ?", [key]);
    if ((existing as any[]).length > 0) {
      return res.status(409).json({ message: "A feature with this key already exists" });
    }

    const defaultEnabled = !!default_enabled;
    const expiresAtValue = expires_at ? normalizeDatetime(String(expires_at)) : null;

    const [result] = await pool.query(
      `INSERT INTO feature_flags (feature_key, name, description, default_enabled, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [key, String(name).trim(), description || null, defaultEnabled, expiresAtValue]
    );

    await logFeatureFlagAudit({
      featureFlagId: (result as any).insertId,
      featureKey: key,
      action: "flag_created",
      actorUserId: req.user!.userId,
      details: { name: String(name).trim(), default_enabled: defaultEnabled, expires_at: expiresAtValue }
    });

    res.json({ message: "Feature created" });
  })
);

/* ============================================================
   SET (OR CLEAR) A PER-SCHOOL OVERRIDE
   This is the only way a feature actually turns on/off for a school —
   system_admin picks a school and a flag and sets its state here.
   ============================================================ */
router.put(
  "/feature-flags/:id/schools/:schoolId",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const schoolId = Number(req.params.schoolId);
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be true or false" });
    }

    await resetExpiredFeatureFlags();

    const [flagRows] = await pool.query("SELECT feature_key FROM feature_flags WHERE id = ?", [id]);
    const featureKey = (flagRows as any[])[0]?.feature_key;
    if (!featureKey) {
      return res.status(404).json({ message: "Feature or school not found" });
    }

    try {
      await pool.query(
        `INSERT INTO school_feature_flags (school_id, feature_flag_id, enabled)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
        [schoolId, id, enabled]
      );
    } catch (err: any) {
      if (err?.code === "ER_NO_REFERENCED_ROW_2" || err?.code === "ER_NO_REFERENCED_ROW") {
        throw new HttpError(404, "Feature or school not found");
      }
      throw err;
    }

    await logFeatureFlagAudit({
      featureFlagId: id,
      featureKey,
      schoolId,
      action: "school_override_set",
      actorUserId: req.user!.userId,
      details: { enabled }
    });

    res.json({ message: "School feature access updated" });
  })
);

/* ============================================================
   CLEAR A PER-SCHOOL OVERRIDE (revert that school to default_enabled)
   ============================================================ */
router.delete(
  "/feature-flags/:id/schools/:schoolId",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const schoolId = Number(req.params.schoolId);

    const [flagRows] = await pool.query("SELECT feature_key FROM feature_flags WHERE id = ?", [id]);
    const featureKey = (flagRows as any[])[0]?.feature_key;

    const [result] = await pool.query(
      `DELETE FROM school_feature_flags WHERE feature_flag_id = ? AND school_id = ?`,
      [id, schoolId]
    );

    if (featureKey && (result as any).affectedRows > 0) {
      await logFeatureFlagAudit({
        featureFlagId: id,
        featureKey,
        schoolId,
        action: "school_override_cleared",
        actorUserId: req.user!.userId
      });
    }

    res.json({ message: "School reverted to the feature's default" });
  })
);

/* ============================================================
   UPDATE FEATURE FLAG METADATA (name, description, default state, expiry)
   ============================================================ */
router.put(
  "/feature-flags/:id",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const { name, description, default_enabled, expires_at } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (expires_at && !DATETIME_RE.test(String(expires_at))) {
      return res.status(400).json({ message: "Invalid expiry date format" });
    }

    const [existing] = await pool.query("SELECT feature_key FROM feature_flags WHERE id = ?", [id]);
    const featureKey = (existing as any[])[0]?.feature_key;
    if (!featureKey) {
      return res.status(404).json({ message: "Feature not found" });
    }

    const expiresAtValue = expires_at ? normalizeDatetime(String(expires_at)) : null;
    const defaultEnabled = !!default_enabled;

    await pool.query(
      `UPDATE feature_flags SET name = ?, description = ?, default_enabled = ?, expires_at = ? WHERE id = ?`,
      [String(name).trim(), description || null, defaultEnabled, expiresAtValue, id]
    );

    await logFeatureFlagAudit({
      featureFlagId: id,
      featureKey,
      action: "flag_updated",
      actorUserId: req.user!.userId,
      details: { name: String(name).trim(), default_enabled: defaultEnabled, expires_at: expiresAtValue }
    });

    res.json({ message: "Feature details updated" });
  })
);

/* ============================================================
   DELETE FEATURE FLAG
   ============================================================ */
router.delete(
  "/feature-flags/:id",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);

    const [existing] = await pool.query("SELECT feature_key FROM feature_flags WHERE id = ?", [id]);
    const featureKey = (existing as any[])[0]?.feature_key;
    if (!featureKey) {
      return res.status(404).json({ message: "Feature not found" });
    }

    await pool.query("DELETE FROM feature_flags WHERE id = ?", [id]);

    // feature_flag_id is null here, not `id` — the row this would reference
    // no longer exists once the DELETE above commits, and the FK is not
    // nullable-on-write, so pointing at a since-deleted id would violate it.
    await logFeatureFlagAudit({
      featureFlagId: null,
      featureKey,
      action: "flag_deleted",
      actorUserId: req.user!.userId
    });

    res.json({ message: "Feature deleted" });
  })
);

/* ============================================================
   RESET AN OWNER'S PASSWORD
   system_admin already resets teacher/parent passwords via the shared
   /admin/users/:id/reset-password endpoint — this is the one path for
   reaching owner accounts, which that endpoint deliberately keeps out of
   an admin's/owner's own reach. Hard-scoped to role = owner so this can't
   turn into a second general-purpose reset endpoint.
   ============================================================ */
router.post(
  "/owners/:id/reset-password",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  resetOwnerPasswordLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = String(req.params.id);

    const [rows] = await pool.query(
      `SELECT u.school_id, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      [userId]
    );
    const target = (rows as any[])[0];
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }
    if (target.role_name !== "owner") {
      return res.status(403).json({ message: "System admins can only reset passwords for owner accounts" });
    }

    if (!(await isFeatureEnabled("password_management", target.school_id))) {
      return res.status(403).json({ message: "Password management is currently disabled for this school" });
    }

    const temporaryPassword = generateTemporaryPassword();
    const newHash = await bcrypt.hash(temporaryPassword, 10);

    await pool.query(
      "UPDATE users SET password_hash = ?, token_version = token_version + 1, must_reset_password = TRUE WHERE id = ?",
      [newHash, userId]
    );

    res.json({ message: "Password reset", temporaryPassword });
  })
);

export default router;
