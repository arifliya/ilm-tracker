"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTokenVersionValid = isTokenVersionValid;
const db_1 = require("../config/db");
// A JWT is only ever invalidated by comparing the token_version it was
// signed with against the user's current value — there's no separate
// blocklist/session store. Logout (routes/auth.ts) bumps the column;
// anything signed before that bump stops passing this check immediately,
// even though the token itself hasn't expired yet.
async function isTokenVersionValid(userId, tokenVersion) {
    const [rows] = await db_1.pool.query("SELECT token_version FROM users WHERE id = ?", [userId]);
    const current = rows[0]?.token_version;
    return current === tokenVersion;
}
