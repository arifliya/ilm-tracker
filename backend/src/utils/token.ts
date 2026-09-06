import { sign } from "hono/jwt";
import type { JwtPayload } from "../types/auth";

export const COOKIE_NAME = "token";

// A cookie is only ever valid for up to an hour at a time — authMiddleware's
// sliding refresh silently reissues it while the user stays active — but the
// whole session, however many times it's been refreshed, is capped at this
// absolute lifetime so it can't be kept alive forever just by staying active.
// Anchored to JwtPayload.sessionStartedAt (the original login), not to the
// most recent refresh.
export const ROLLING_WINDOW_SECONDS = 60 * 60; // 1 hour
export const ABSOLUTE_SESSION_LIFETIME_SECONDS = 12 * 60 * 60; // 12 hours

export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    // *.pages.dev and *.workers.dev are different registrable domains —
    // different "sites" as far as the SameSite spec is concerned — so this
    // is a genuinely cross-site request, not just cross-origin. SameSite=Lax
    // would silently not be sent. Revisit once both sit on the same custom
    // domain (e.g. app.example.com / api.example.com), where Lax would work
    // again and be the tighter choice.
    sameSite: "None" as const,
    path: "/"
  };
}

// hono/jwt has no `expiresIn` sugar like jsonwebtoken — iat/exp are set on
// the payload directly.
export async function signToken(
  jwtSecret: string,
  payload: JwtPayload,
  expiresInSeconds: number = ROLLING_WINDOW_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ ...payload, iat: now, exp: now + expiresInSeconds }, jwtSecret);
}
