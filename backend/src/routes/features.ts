import { Router } from "express";
import { pool } from "../config/db";
import { authMiddleware } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/auth";
import { resetExpiredFeatureFlags } from "../utils/featureFlags";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

/* ============================================================
   GET STATUS OF ALL FEATURE FLAGS FOR THE CALLER'S SCHOOL
   Used by dashboards to decide whether to show flag-gated UI. Reflects
   that school's explicit override where system_admin has set one,
   otherwise each flag's default_enabled.
   ============================================================ */
router.get(
  "/",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await resetExpiredFeatureFlags();

    const [rows] = await pool.query(
      `SELECT
         ff.feature_key,
         COALESCE(sff.enabled, ff.default_enabled) AS enabled
       FROM feature_flags ff
       LEFT JOIN school_feature_flags sff
         ON sff.feature_flag_id = ff.id AND sff.school_id = ?`,
      [req.user!.schoolId]
    );

    const flags: Record<string, boolean> = {};
    (rows as any[]).forEach(row => {
      flags[row.feature_key] = !!row.enabled;
    });

    res.json({ flags });
  })
);

export default router;
