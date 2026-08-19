import { Router } from "express";
import { pool } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { resetExpiredFeatureFlags } from "../utils/featureFlags";

const router = Router();

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

/* ============================================================
   LIST SCHOOLS
   ============================================================ */
router.get("/schools", authMiddleware, SYSTEM_ADMIN_ONLY, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, school_code, created_at FROM schools ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Schools load error:", err);
    res.status(500).json({ message: "Failed to load schools" });
  }
});

/* ============================================================
   CREATE SCHOOL (generates a unique school_code)
   ============================================================ */
router.post("/schools", authMiddleware, SYSTEM_ADMIN_ONLY, async (req, res) => {
  try {
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
      return res.status(500).json({ message: "Failed to generate a unique school code, try again" });
    }

    await pool.query(
      `INSERT INTO schools (name, school_code) VALUES (?, ?)`,
      [name, code]
    );

    res.status(201).json({ message: "School created", school_code: code });
  } catch (err) {
    console.error("School create error:", err);
    res.status(500).json({ message: "Failed to create school" });
  }
});

/* ============================================================
   LIST FEATURE FLAGS + PER-SCHOOL OVERRIDES
   Returns the flag catalog, every school, and the explicit overrides that
   exist — the caller derives each school's effective state as
   override.enabled if one exists, else the flag's default_enabled.
   ============================================================ */
router.get("/feature-flags", authMiddleware, SYSTEM_ADMIN_ONLY, async (_req, res) => {
  try {
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
  } catch (err) {
    console.error("Feature flags load error:", err);
    res.status(500).json({ message: "Failed to load feature flags" });
  }
});

/* ============================================================
   CREATE FEATURE FLAG
   ============================================================ */
router.post("/feature-flags", authMiddleware, SYSTEM_ADMIN_ONLY, async (req, res) => {
  try {
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

    await pool.query(
      `INSERT INTO feature_flags (feature_key, name, description, default_enabled, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [key, String(name).trim(), description || null, defaultEnabled, expiresAtValue]
    );

    res.json({ message: "Feature created" });
  } catch (err) {
    console.error("Feature flag create error:", err);
    res.status(500).json({ message: "Failed to create feature" });
  }
});

/* ============================================================
   SET (OR CLEAR) A PER-SCHOOL OVERRIDE
   This is the only way a feature actually turns on/off for a school —
   system_admin picks a school and a flag and sets its state here.
   ============================================================ */
router.put(
  "/feature-flags/:id/schools/:schoolId",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const schoolId = Number(req.params.schoolId);
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled must be true or false" });
      }

      await resetExpiredFeatureFlags();

      await pool.query(
        `INSERT INTO school_feature_flags (school_id, feature_flag_id, enabled)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
        [schoolId, id, enabled]
      );

      res.json({ message: "School feature access updated" });
    } catch (err: any) {
      console.error("Feature flag school override error:", err);
      if (err?.code === "ER_NO_REFERENCED_ROW_2" || err?.code === "ER_NO_REFERENCED_ROW") {
        return res.status(404).json({ message: "Feature or school not found" });
      }
      res.status(500).json({ message: "Failed to update school feature access" });
    }
  }
);

/* ============================================================
   CLEAR A PER-SCHOOL OVERRIDE (revert that school to default_enabled)
   ============================================================ */
router.delete(
  "/feature-flags/:id/schools/:schoolId",
  authMiddleware,
  SYSTEM_ADMIN_ONLY,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const schoolId = Number(req.params.schoolId);

      await pool.query(
        `DELETE FROM school_feature_flags WHERE feature_flag_id = ? AND school_id = ?`,
        [id, schoolId]
      );

      res.json({ message: "School reverted to the feature's default" });
    } catch (err) {
      console.error("Feature flag school override delete error:", err);
      res.status(500).json({ message: "Failed to reset school feature access" });
    }
  }
);

/* ============================================================
   UPDATE FEATURE FLAG METADATA (name, description, default state, expiry)
   ============================================================ */
router.put("/feature-flags/:id", authMiddleware, SYSTEM_ADMIN_ONLY, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, default_enabled, expires_at } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (expires_at && !DATETIME_RE.test(String(expires_at))) {
      return res.status(400).json({ message: "Invalid expiry date format" });
    }

    const expiresAtValue = expires_at ? normalizeDatetime(String(expires_at)) : null;

    const [result] = await pool.query(
      `UPDATE feature_flags SET name = ?, description = ?, default_enabled = ?, expires_at = ? WHERE id = ?`,
      [String(name).trim(), description || null, !!default_enabled, expiresAtValue, id]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ message: "Feature not found" });
    }

    res.json({ message: "Feature details updated" });
  } catch (err) {
    console.error("Feature flag update error:", err);
    res.status(500).json({ message: "Failed to update feature" });
  }
});

/* ============================================================
   DELETE FEATURE FLAG
   ============================================================ */
router.delete("/feature-flags/:id", authMiddleware, SYSTEM_ADMIN_ONLY, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM feature_flags WHERE id = ?", [req.params.id]);

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ message: "Feature not found" });
    }

    res.json({ message: "Feature deleted" });
  } catch (err) {
    console.error("Feature flag delete error:", err);
    res.status(500).json({ message: "Failed to delete feature" });
  }
});

export default router;
