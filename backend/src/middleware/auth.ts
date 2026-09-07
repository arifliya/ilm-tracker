import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import type { AppEnv } from "../types/env";
import type { JwtPayload, RoleName } from "../types/auth";
import { isTokenVersionValid } from "../utils/tokenVersion";
import {
  signToken,
  cookieOptions,
  ROLLING_WINDOW_SECONDS,
  ABSOLUTE_SESSION_LIFETIME_SECONDS,
  COOKIE_NAME
} from "../utils/token";
import { logger } from "../utils/logger";
import { requireEnv, isCookieSecure } from "../config/env";

type DecodedToken = JwtPayload & { iat: number; exp: number };

// Endpoints an account can still reach while mustResetPassword is true —
// enough to see who's signed in, complete the forced change, or bail out
// via logout. Matched against c.req.path, which (unlike a sub-router's
// relative path) is always the full mounted path, e.g. "/api/auth/me".
const MUST_RESET_ALLOWLIST = new Set([
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/force-password-reset"
]);

export const authMiddleware = async (c: Context<AppEnv>, next: Next) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return c.json({ message: "Not authenticated" }, 401);

  const jwtSecret = requireEnv(c, "JWT_SECRET");
  let decoded: DecodedToken;
  try {
    decoded = (await verify(token, jwtSecret, "HS256")) as unknown as DecodedToken;
  } catch {
    return c.json({ message: "Invalid token" }, 401);
  }

  try {
    const valid = await isTokenVersionValid(c.get("db"), decoded.userId, decoded.tokenVersion);
    if (!valid) {
      return c.json({ message: "Session no longer valid, please log in again" }, 401);
    }
  } catch (err) {
    logger.error({ err }, "Token version check failed");
    return c.json({ message: "Server error" }, 500);
  }

  c.set("user", decoded);

  if (decoded.mustResetPassword && !MUST_RESET_ALLOWLIST.has(c.req.path)) {
    return c.json(
      {
        message: "You must reset your password before continuing",
        code: "PASSWORD_RESET_REQUIRED"
      },
      403
    );
  }

  // Sliding session: an active user's cookie is quietly reissued once it's
  // past the halfway point of its lifetime, so they're never hard-logged-out
  // mid-session — only a genuinely idle session (no requests for the back
  // half of the token's life) actually expires. Falls back to the token's
  // own iat for sessionStartedAt so a token issued before that field existed
  // doesn't crash — it's just treated as starting now, capped 12h from here.
  const now = Math.floor(Date.now() / 1000);
  const sessionStartedAt = decoded.sessionStartedAt ?? decoded.iat;
  const halfLife = (decoded.exp - decoded.iat) / 2;
  if (decoded.exp - now < halfLife) {
    const remainingUntilCap = sessionStartedAt + ABSOLUTE_SESSION_LIFETIME_SECONDS - now;
    if (remainingUntilCap > 0) {
      const fresh = await signToken(
        jwtSecret,
        {
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role,
          schoolId: decoded.schoolId,
          tokenVersion: decoded.tokenVersion,
          sessionStartedAt,
          mustResetPassword: decoded.mustResetPassword
        },
        Math.min(ROLLING_WINDOW_SECONDS, remainingUntilCap)
      );
      setCookie(c, COOKIE_NAME, fresh, cookieOptions(isCookieSecure(c)));
    }
    // Past the 12h cap: no reissue. The current token still has a little
    // life left (its own expiry was itself capped on the last refresh), so
    // this request still goes through — the next one hits natural JWT
    // expiry and forces a real re-login.
  }

  await next();
};

export const requireRole =
  (...roles: RoleName[]) =>
  async (c: Context<AppEnv>, next: Next) => {
    const user = c.get("user");
    if (!user) return c.json({ message: "Not authenticated" }, 401);
    if (!roles.includes(user.role)) return c.json({ message: "Forbidden" }, 403);
    await next();
  };
