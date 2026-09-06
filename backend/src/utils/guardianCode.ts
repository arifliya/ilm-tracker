import crypto from "crypto";
import type { DbConnection } from "../config/db";

const GUARDIAN_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // same alphabet as school_code — avoids ambiguous chars

interface IdRow {
  id: number;
}

const generateGuardianCode = () => {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += GUARDIAN_CODE_CHARS[crypto.randomInt(GUARDIAN_CODE_CHARS.length)];
  }
  return code;
};

// Runs on the caller's transaction connection so the uniqueness check sees
// any guardian_code inserted earlier in the same transaction. Shared
// between auth.ts (register-parent) and parent.ts (add-child) so the two
// flows can't drift out of sync with each other.
export const generateUniqueGuardianCode = async (conn: DbConnection, schoolId: number): Promise<string> => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateGuardianCode();
    const { rows: existing } = await conn.query<IdRow>(
      "SELECT id FROM students WHERE school_id = $1 AND guardian_code = $2",
      [schoolId, candidate]
    );
    if (existing.length === 0) return candidate;
  }
  throw new Error("Failed to generate a unique guardian code");
};
