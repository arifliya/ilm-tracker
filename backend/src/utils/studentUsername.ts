import type { DbConnection } from "../config/db";

interface IdRow {
  id: number;
}

const buildCandidate = (firstName: string, surname: string, attempt: number): string => {
  const base = `${firstName} ${surname}`;
  return attempt === 0 ? base : `${base} ${attempt + 1}`;
};

// Runs on the caller's transaction connection so the uniqueness check sees
// any username inserted earlier in the same transaction (e.g. siblings in
// the same bulk-upload batch). Unlike guardian codes, usernames aren't
// random — a collision means another user already has this exact name, so
// candidates are deterministic ("Ali Khan", "Ali Khan 2", "Ali Khan 3", ...)
// rather than randomly regenerated.
export const generateUniqueUsername = async (
  conn: DbConnection,
  firstName: string,
  surname: string
): Promise<string> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = buildCandidate(firstName, surname, attempt);
    const { rows: existing } = await conn.query<IdRow>("SELECT id FROM users WHERE username = $1", [candidate]);
    if (existing.length === 0) return candidate;
  }
  throw new Error("Failed to generate a unique username");
};
