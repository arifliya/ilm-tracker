import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthenticatedRequest, JwtPayload, RoleName } from "../types/auth";
import { isTokenVersionValid } from "../utils/tokenVersion";
import { signToken, COOKIE_OPTIONS, ROLLING_WINDOW_SECONDS, ABSOLUTE_SESSION_LIFETIME_SECONDS } from "../utils/token";
import { logger } from "../utils/logger";

type DecodedToken = JwtPayload & { iat: number; exp: number };

// Endpoints an account can still reach while mustResetPassword is true —
// enough to see who's signed in, complete the forced change, or bail out
// via logout. Matched against req.originalUrl (stable across however deep
// a router this middleware runs in), not req.path (relative to whichever
// sub-router mounted it).
const MUST_RESET_ALLOWLIST = new Set([
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/force-password-reset"
]);

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  let decoded: DecodedToken;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as DecodedToken;
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }

  try {
    const valid = await isTokenVersionValid(decoded.userId, decoded.tokenVersion);
    if (!valid) {
      return res.status(401).json({ message: "Session no longer valid, please log in again" });
    }
  } catch (err) {
    logger.error({ err }, "Token version check failed");
    return res.status(500).json({ message: "Server error" });
  }

  req.user = decoded;

  if (decoded.mustResetPassword && !MUST_RESET_ALLOWLIST.has(req.originalUrl.split("?")[0])) {
    return res.status(403).json({
      message: "You must reset your password before continuing",
      code: "PASSWORD_RESET_REQUIRED"
    });
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
      const fresh = signToken(
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
      res.cookie("token", fresh, COOKIE_OPTIONS);
    }
    // Past the 12h cap: no reissue. The current token still has a little
    // life left (its own expiry was itself capped on the last refresh), so
    // this request still goes through — the next one hits natural JWT
    // expiry and forces a real re-login.
  }

  next();
};

export const requireRole =
  (...roles: RoleName[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ message: "Forbidden" });
    next();
  };
