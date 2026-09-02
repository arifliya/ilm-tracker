"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ABSOLUTE_SESSION_LIFETIME_SECONDS = exports.ROLLING_WINDOW_SECONDS = exports.COOKIE_OPTIONS = void 0;
exports.signToken = signToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
exports.COOKIE_OPTIONS = {
    httpOnly: true,
    secure: env_1.env.COOKIE_SECURE,
    sameSite: "lax"
};
// A cookie is only ever valid for up to an hour at a time — authMiddleware's
// sliding refresh silently reissues it while the user stays active — but the
// whole session, however many times it's been refreshed, is capped at this
// absolute lifetime so it can't be kept alive forever just by staying active.
// Anchored to JwtPayload.sessionStartedAt (the original login), not to the
// most recent refresh.
exports.ROLLING_WINDOW_SECONDS = 60 * 60; // 1 hour
exports.ABSOLUTE_SESSION_LIFETIME_SECONDS = 12 * 60 * 60; // 12 hours
function signToken(payload, expiresInSeconds = exports.ROLLING_WINDOW_SECONDS) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, { expiresIn: expiresInSeconds });
}
