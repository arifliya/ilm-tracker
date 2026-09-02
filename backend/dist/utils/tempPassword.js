"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTemporaryPassword = void 0;
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous chars, same spirit as school_code/guardian_code
// Generates a one-time password for a parent account created during a bulk
// upload (backend/src/routes/admin.ts's /students/bulk-upload) — this app
// has no password-reset/email flow, so the admin relays this to the parent
// out of band. Retried until it satisfies isStrongPassword (auth.ts) since
// login itself enforces that rule on every other path.
const generateTemporaryPassword = () => {
    for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = Array.from({ length: 10 }, () => PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)]).join("");
        if (/[A-Za-z]/.test(candidate) && /[0-9]/.test(candidate))
            return candidate;
    }
    throw new Error("Failed to generate a temporary password");
};
exports.generateTemporaryPassword = generateTemporaryPassword;
