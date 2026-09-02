"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueGuardianCode = void 0;
const GUARDIAN_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // same alphabet as school_code — avoids ambiguous chars
const generateGuardianCode = () => {
    let code = "";
    for (let i = 0; i < 8; i++) {
        code += GUARDIAN_CODE_CHARS[Math.floor(Math.random() * GUARDIAN_CODE_CHARS.length)];
    }
    return code;
};
// Runs on the caller's transaction connection so the uniqueness check sees
// any guardian_code inserted earlier in the same transaction. Shared
// between auth.ts (register-parent) and parent.ts (add-child) so the two
// flows can't drift out of sync with each other.
const generateUniqueGuardianCode = async (conn, schoolId) => {
    for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateGuardianCode();
        const [existing] = await conn.query("SELECT id FROM students WHERE school_id = ? AND guardian_code = ?", [schoolId, candidate]);
        if (existing.length === 0)
            return candidate;
    }
    throw new Error("Failed to generate a unique guardian code");
};
exports.generateUniqueGuardianCode = generateUniqueGuardianCode;
