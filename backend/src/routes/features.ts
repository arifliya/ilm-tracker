import { Hono } from "hono";
import type { AppEnv } from "../types/env";
import { authMiddleware } from "../middleware/auth";
import { resetExpiredFeatureFlags } from "../utils/featureFlags";

const router = new Hono<AppEnv>();

/* ============================================================
   GET STATUS OF ALL FEATURE FLAGS FOR THE CALLER'S SCHOOL
   Used by dashboards to decide whether to show flag-gated UI. Reflects
   that school's explicit override where system_admin has set one,
   otherwise each flag's default_enabled.
   ============================================================ */
interface FlagStatusRow {
  feature_key: string;
  enabled: boolean;
}

router.get("/", authMiddleware, async c => {
  const db = c.get("db");
  await resetExpiredFeatureFlags(db);

  const { rows } = await db.query<FlagStatusRow>(
    `SELECT
       ff.feature_key,
       COALESCE(sff.enabled, ff.default_enabled) AS enabled
     FROM feature_flags ff
     LEFT JOIN school_feature_flags sff
       ON sff.feature_flag_id = ff.id AND sff.school_id = $1`,
    [c.get("user")!.schoolId]
  );

  const flags: Record<string, boolean> = {};
  rows.forEach(row => {
    flags[row.feature_key] = !!row.enabled;
  });

  return c.json({ flags });
});

export default router;
