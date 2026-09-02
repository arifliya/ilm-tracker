import jwt from "jsonwebtoken";
import { CookieOptions } from "express";
import { env } from "../config/env";
import { JwtPayload } from "../types/auth";

export const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax"
};

// A cookie is only ever valid for up to an hour at a time — authMiddleware's
// sliding refresh silently reissues it while the user stays active — but the
// whole session, however many times it's been refreshed, is capped at this
// absolute lifetime so it can't be kept alive forever just by staying active.
// Anchored to JwtPayload.sessionStartedAt (the original login), not to the
// most recent refresh.
export const ROLLING_WINDOW_SECONDS = 60 * 60; // 1 hour
export const ABSOLUTE_SESSION_LIFETIME_SECONDS = 12 * 60 * 60; // 12 hours

export function signToken(payload: JwtPayload, expiresInSeconds: number = ROLLING_WINDOW_SECONDS): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: expiresInSeconds });
}
