"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFeatureEnabled = exports.resetExpiredFeatureFlags = void 0;
const db_1 = require("../config/db");
// A flag's expiry is a property of the flag itself, not of any one school's
// override — once it passes, every school's override for that flag is
// cleared so everyone reverts to default_enabled, and the expiry itself is
// cleared. This keeps that invariant true regardless of which route touches
// the table.
const resetExpiredFeatureFlags = async () => {
    const [expired] = await db_1.pool.query("SELECT id FROM feature_flags WHERE expires_at IS NOT NULL AND expires_at < NOW()");
    for (const flag of expired) {
        await db_1.pool.query("DELETE FROM school_feature_flags WHERE feature_flag_id = ?", [flag.id]);
    }
    if (expired.length > 0) {
        await db_1.pool.query("UPDATE feature_flags SET expires_at = NULL WHERE expires_at IS NOT NULL AND expires_at < NOW()");
    }
};
exports.resetExpiredFeatureFlags = resetExpiredFeatureFlags;
// Effective state for one school: its explicit override if system_admin has
// set one, otherwise the flag's default_enabled.
const isFeatureEnabled = async (key, schoolId) => {
    await (0, exports.resetExpiredFeatureFlags)();
    const [rows] = await db_1.pool.query(`SELECT ff.default_enabled AS default_enabled, sff.enabled AS override_enabled
     FROM feature_flags ff
     LEFT JOIN school_feature_flags sff
       ON sff.feature_flag_id = ff.id AND sff.school_id = ?
     WHERE ff.feature_key = ?`, [schoolId, key]);
    const row = rows[0];
    if (!row)
        return false;
    return row.override_enabled !== null ? !!row.override_enabled : !!row.default_enabled;
};
exports.isFeatureEnabled = isFeatureEnabled;
