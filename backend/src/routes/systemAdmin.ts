import { Hono } from "hono";
import type { AppEnv } from "../types/env";
import type { DbConnection } from "../config/db";
import bcrypt from "bcryptjs";
import { authMiddleware, requireRole } from "../middleware/auth";
import { resetExpiredFeatureFlags, isFeatureEnabled } from "../utils/featureFlags";
import { generateTemporaryPassword } from "../utils/tempPassword";
import { checkRateLimit } from "../utils/rateLimit";
import { HttpError } from "../utils/httpError";

const router = new Hono<AppEnv>();

interface IdRow {
  id: number;
}

interface FeatureKeyRow {
  feature_key: string;
}

const SYSTEM_ADMIN_ONLY = requireRole("system_admin");

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
const logFeatureFlagAudit = async (
  db: DbConnection,
  entry: {
    featureFlagId: number | null;
    featureKey: string;
    schoolId?: number | null;
    action: string;
    actorUserId: number;
    details?: Record<string, unknown>;
  }
) => {
  await db.query(
    `INSERT INTO feature_flag_audit_log
       (feature_flag_id, feature_key, school_id, action, actor_user_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
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
interface SchoolRow {
  id: number;
  name: string;
  school_code: string;
  created_at: Date;
}

router.get("/schools", authMiddleware, SYSTEM_ADMIN_ONLY, async c => {
  const { rows } = await c
    .get("db")
    .query<SchoolRow>(`SELECT id, name, school_code, created_at FROM schools ORDER BY name ASC`);
  return c.json(rows);
});

/* ============================================================
   CREATE SCHOOL (generates a unique school_code)
   ============================================================ */
router.post("/schools", authMiddleware, SYSTEM_ADMIN_ONLY, async c => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  if (!name) {
    return c.json({ message: "School name is required" }, 400);
  }

  let code = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateSchoolCode();
    const { rows: existing } = await db.query<IdRow>("SELECT id FROM schools WHERE school_code = $1", [candidate]);
    if (existing.length === 0) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    throw new HttpError(500, "Failed to generate a unique school code, try again");
  }

  await db.query(`INSERT INTO schools (name, school_code) VALUES ($1, $2)`, [name, code]);

  return c.json({ message: "School created", school_code: code }, 201);
});

/* ============================================================
   LIST FEATURE FLAGS + PER-SCHOOL OVERRIDES
   Returns the flag catalog, every school, and the explicit overrides that
   exist — the caller derives each school's effective state as
   override.enabled if one exists, else the flag's default_enabled.
   ============================================================ */
interface FeatureFlagRow {
  id: number;
  feature_key: string;
  name: string;
  description: string | null;
  default_enabled: boolean;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface SchoolListRow {
  id: number;
  name: string;
  school_code: string;
}

interface OverrideRow {
  school_id: number;
  feature_flag_id: number;
  enabled: boolean;
}

router.get("/feature-flags", authMiddleware, SYSTEM_ADMIN_ONLY, async c => {
  const db = c.get("db");
  await resetExpiredFeatureFlags(db);

  const { rows: flags } = await db.query<FeatureFlagRow>(
    `SELECT id, feature_key, name, description, default_enabled,
            expires_at, created_at, updated_at
     FROM feature_flags
     ORDER BY name ASC`
  );

  const { rows: schools } = await db.query<SchoolListRow>(`SELECT id, name, school_code FROM schools ORDER BY name ASC`);

  const { rows: overrides } = await db.query<OverrideRow>(
    `SELECT school_id, feature_flag_id, enabled FROM school_feature_flags`
  );

  return c.json({ flags, schools, overrides });
});

/* ============================================================
   FEATURE FLAG AUDIT LOG — recent create/update/delete/override actions,
   newest first. Capped at 200 rows; this is an activity feed, not a report.
   ============================================================ */
interface AuditLogRow {
  id: number;
  feature_flag_id: number | null;
  feature_key: string;
  school_id: number | null;
  school_name: string | null;
  action: string;
  actor_user_id: number | null;
  actor_username: string;
  details: unknown;
  created_at: Date;
}

router.get("/feature-flags/audit-log", authMiddleware, SYSTEM_ADMIN_ONLY, async c => {
  const { rows } = await c.get("db").query<AuditLogRow>(
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

  return c.json(rows);
});

/* ============================================================
   CREATE FEATURE FLAG
   ============================================================ */
router.post("/feature-flags", authMiddleware, SYSTEM_ADMIN_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const { feature_key, name, description, default_enabled, expires_at } = await c.req.json();

  const key = String(feature_key || "").trim().toLowerCase();
  if (!KEY_RE.test(key)) {
    return c.json(
      { message: "Feature key must start with a letter and contain only lowercase letters, numbers, or underscores" },
      400
    );
  }

  if (!name || !String(name).trim()) {
    return c.json({ message: "Name is required" }, 400);
  }

  if (expires_at && !DATETIME_RE.test(String(expires_at))) {
    return c.json({ message: "Invalid expiry date format" }, 400);
  }

  const { rows: existing } = await db.query<IdRow>("SELECT id FROM feature_flags WHERE feature_key = $1", [key]);
  if (existing.length > 0) {
    return c.json({ message: "A feature with this key already exists" }, 409);
  }

  const defaultEnabled = !!default_enabled;
  const expiresAtValue = expires_at ? normalizeDatetime(String(expires_at)) : null;

  const {
    rows: [row]
  } = await db.query<IdRow>(
    `INSERT INTO feature_flags (feature_key, name, description, default_enabled, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [key, String(name).trim(), description || null, defaultEnabled, expiresAtValue]
  );

  await logFeatureFlagAudit(db, {
    featureFlagId: row.id,
    featureKey: key,
    action: "flag_created",
    actorUserId: user.userId,
    details: { name: String(name).trim(), default_enabled: defaultEnabled, expires_at: expiresAtValue }
  });

  return c.json({ message: "Feature created" });
});

/* ============================================================
   SET (OR CLEAR) A PER-SCHOOL OVERRIDE
   This is the only way a feature actually turns on/off for a school —
   system_admin picks a school and a flag and sets its state here.
   ============================================================ */
router.put("/feature-flags/:id/schools/:schoolId", authMiddleware, SYSTEM_ADMIN_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const schoolId = Number(c.req.param("schoolId"));
  const { enabled } = await c.req.json();

  if (typeof enabled !== "boolean") {
    return c.json({ message: "enabled must be true or false" }, 400);
  }

  await resetExpiredFeatureFlags(db);

  const { rows: flagRows } = await db.query<FeatureKeyRow>("SELECT feature_key FROM feature_flags WHERE id = $1", [id]);
  const featureKey = flagRows[0]?.feature_key;
  if (!featureKey) {
    return c.json({ message: "Feature or school not found" }, 404);
  }

  try {
    await db.query(
      `INSERT INTO school_feature_flags (school_id, feature_flag_id, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (school_id, feature_flag_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [schoolId, id, enabled]
    );
  } catch (err: any) {
    if (err?.code === "23503") {
      throw new HttpError(404, "Feature or school not found");
    }
    throw err;
  }

  await logFeatureFlagAudit(db, {
    featureFlagId: id,
    featureKey,
    schoolId,
    action: "school_override_set",
    actorUserId: user.userId,
    details: { enabled }
  });

  return c.json({ message: "School feature access updated" });
});

/* ============================================================
   CLEAR A PER-SCHOOL OVERRIDE (revert that school to default_enabled)
   ============================================================ */
router.delete("/feature-flags/:id/schools/:schoolId", authMiddleware, SYSTEM_ADMIN_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const schoolId = Number(c.req.param("schoolId"));

  const { rows: flagRows } = await db.query<FeatureKeyRow>("SELECT feature_key FROM feature_flags WHERE id = $1", [id]);
  const featureKey = flagRows[0]?.feature_key;

  const { rowCount } = await db.query(
    `DELETE FROM school_feature_flags WHERE feature_flag_id = $1 AND school_id = $2`,
    [id, schoolId]
  );

  if (featureKey && (rowCount ?? 0) > 0) {
    await logFeatureFlagAudit(db, {
      featureFlagId: id,
      featureKey,
      schoolId,
      action: "school_override_cleared",
      actorUserId: user.userId
    });
  }

  return c.json({ message: "School reverted to the feature's default" });
});

/* ============================================================
   UPDATE FEATURE FLAG METADATA (name, description, default state, expiry)
   ============================================================ */
router.put("/feature-flags/:id", authMiddleware, SYSTEM_ADMIN_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const { name, description, default_enabled, expires_at } = await c.req.json();

  if (!name || !String(name).trim()) {
    return c.json({ message: "Name is required" }, 400);
  }

  if (expires_at && !DATETIME_RE.test(String(expires_at))) {
    return c.json({ message: "Invalid expiry date format" }, 400);
  }

  const { rows: existing } = await db.query<FeatureKeyRow>("SELECT feature_key FROM feature_flags WHERE id = $1", [id]);
  const featureKey = existing[0]?.feature_key;
  if (!featureKey) {
    return c.json({ message: "Feature not found" }, 404);
  }

  const expiresAtValue = expires_at ? normalizeDatetime(String(expires_at)) : null;
  const defaultEnabled = !!default_enabled;

  await db.query(
    `UPDATE feature_flags SET name = $1, description = $2, default_enabled = $3, expires_at = $4 WHERE id = $5`,
    [String(name).trim(), description || null, defaultEnabled, expiresAtValue, id]
  );

  await logFeatureFlagAudit(db, {
    featureFlagId: id,
    featureKey,
    action: "flag_updated",
    actorUserId: user.userId,
    details: { name: String(name).trim(), default_enabled: defaultEnabled, expires_at: expiresAtValue }
  });

  return c.json({ message: "Feature details updated" });
});

/* ============================================================
   DELETE FEATURE FLAG
   ============================================================ */
router.delete("/feature-flags/:id", authMiddleware, SYSTEM_ADMIN_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));

  const { rows: existing } = await db.query<FeatureKeyRow>("SELECT feature_key FROM feature_flags WHERE id = $1", [id]);
  const featureKey = existing[0]?.feature_key;
  if (!featureKey) {
    return c.json({ message: "Feature not found" }, 404);
  }

  await db.query("DELETE FROM feature_flags WHERE id = $1", [id]);

  // feature_flag_id is null here, not `id` — the row this would reference
  // no longer exists once the DELETE above commits, and the FK is not
  // nullable-on-write, so pointing at a since-deleted id would violate it.
  await logFeatureFlagAudit(db, {
    featureFlagId: null,
    featureKey,
    action: "flag_deleted",
    actorUserId: user.userId
  });

  return c.json({ message: "Feature deleted" });
});

/* ============================================================
   RESET AN OWNER'S PASSWORD
   system_admin already resets teacher/parent passwords via the shared
   /admin/users/:id/reset-password endpoint — this is the one path for
   reaching owner accounts, which that endpoint deliberately keeps out of
   an admin's/owner's own reach. Hard-scoped to role = owner so this can't
   turn into a second general-purpose reset endpoint.
   ============================================================ */
interface OwnerTargetRow {
  school_id: number | null;
  role_name: string;
}

router.post("/owners/:id/reset-password", authMiddleware, SYSTEM_ADMIN_ONLY, async c => {
  if (!(await checkRateLimit(c, { key: "reset-owner-password", limit: 30, windowSeconds: 3600 }))) {
    return c.json({ message: "Too many password resets. Please try again later." }, 429);
  }

  const db = c.get("db");
  const userId = c.req.param("id");

  const { rows } = await db.query<OwnerTargetRow>(
    `SELECT u.school_id, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [userId]
  );
  const target = rows[0];
  if (!target) {
    return c.json({ message: "User not found" }, 404);
  }
  if (target.role_name !== "owner") {
    return c.json({ message: "System admins can only reset passwords for owner accounts" }, 403);
  }

  if (!(await isFeatureEnabled(db, "password_management", target.school_id))) {
    return c.json({ message: "Password management is currently disabled for this school" }, 403);
  }

  const temporaryPassword = generateTemporaryPassword();
  const newHash = await bcrypt.hash(temporaryPassword, 10);

  await db.query(
    "UPDATE users SET password_hash = $1, token_version = token_version + 1, must_reset_password = TRUE WHERE id = $2",
    [newHash, userId]
  );

  return c.json({ message: "Password reset", temporaryPassword });
});

export default router;
