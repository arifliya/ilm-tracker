"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../config/db");
const auth_1 = require("../middleware/auth");
const featureFlags_1 = require("../utils/featureFlags");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
/* ============================================================
   GET STATUS OF ALL FEATURE FLAGS FOR THE CALLER'S SCHOOL
   Used by dashboards to decide whether to show flag-gated UI. Reflects
   that school's explicit override where system_admin has set one,
   otherwise each flag's default_enabled.
   ============================================================ */
router.get("/", auth_1.authMiddleware, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await (0, featureFlags_1.resetExpiredFeatureFlags)();
    const [rows] = await db_1.pool.query(`SELECT
         ff.feature_key,
         COALESCE(sff.enabled, ff.default_enabled) AS enabled
       FROM feature_flags ff
       LEFT JOIN school_feature_flags sff
         ON sff.feature_flag_id = ff.id AND sff.school_id = ?`, [req.user.schoolId]);
    const flags = {};
    rows.forEach(row => {
        flags[row.feature_key] = !!row.enabled;
    });
    res.json({ flags });
}));
exports.default = router;
