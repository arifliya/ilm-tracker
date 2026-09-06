import type { DbConnection } from "../config/db";

interface TokenVersionRow {
  token_version: number;
}

// A JWT is only ever invalidated by comparing the token_version it was
// signed with against the user's current value — there's no separate
// blocklist/session store. Logout (routes/auth.ts) bumps the column;
// anything signed before that bump stops passing this check immediately,
// even though the token itself hasn't expired yet.
export async function isTokenVersionValid(
  db: DbConnection,
  userId: number,
  tokenVersion: number
): Promise<boolean> {
  const { rows } = await db.query<TokenVersionRow>("SELECT token_version FROM users WHERE id = $1", [userId]);
  const current = rows[0]?.token_version;
  return current === tokenVersion;
}
