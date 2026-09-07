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
    // different "sites" as far as the SameSite spec is concerned — so a
    // real deployment is a genuinely cross-site request, not just
    // cross-origin, and needs SameSite=None to have the cookie sent at all.
    // But SameSite=None is only valid alongside Secure — a browser drops
    // the cookie outright otherwise — so this can't be hardcoded to "None"
    // independently of `secure`: local dev runs COOKIE_SECURE=false over
    // plain http://localhost, and pairing that with SameSite=None would
    // mean the login cookie silently never gets stored. Locally,
    // frontend/backend are both on "localhost" (different ports only), so
    // they're still the same *site*, and Lax already covers that fine.
    // Revisit once a real deployment sits on one shared custom domain too
    // (e.g. app.example.com / api.example.com) — Lax would work there as
    // the tighter choice, same as local dev today.
    sameSite: (secure ? "None" : "Lax") as "None" | "Lax",
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
