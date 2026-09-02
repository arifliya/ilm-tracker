"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const tokenVersion_1 = require("../utils/tokenVersion");
const token_1 = require("../utils/token");
const logger_1 = require("../utils/logger");
const authMiddleware = async (req, res, next) => {
    const token = req.cookies?.token;
    if (!token)
        return res.status(401).json({ message: "Not authenticated" });
    let decoded;
    try {
        decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
    }
    catch {
        return res.status(401).json({ message: "Invalid token" });
    }
    try {
        const valid = await (0, tokenVersion_1.isTokenVersionValid)(decoded.userId, decoded.tokenVersion);
        if (!valid) {
            return res.status(401).json({ message: "Session no longer valid, please log in again" });
        }
    }
    catch (err) {
        logger_1.logger.error({ err }, "Token version check failed");
        return res.status(500).json({ message: "Server error" });
    }
    req.user = decoded;
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
        const remainingUntilCap = sessionStartedAt + token_1.ABSOLUTE_SESSION_LIFETIME_SECONDS - now;
        if (remainingUntilCap > 0) {
            const fresh = (0, token_1.signToken)({
                userId: decoded.userId,
                username: decoded.username,
                role: decoded.role,
                schoolId: decoded.schoolId,
                tokenVersion: decoded.tokenVersion,
                sessionStartedAt
            }, Math.min(token_1.ROLLING_WINDOW_SECONDS, remainingUntilCap));
            res.cookie("token", fresh, token_1.COOKIE_OPTIONS);
        }
        // Past the 12h cap: no reissue. The current token still has a little
        // life left (its own expiry was itself capped on the last refresh), so
        // this request still goes through — the next one hits natural JWT
        // expiry and forces a real re-login.
    }
    next();
};
exports.authMiddleware = authMiddleware;
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user)
        return res.status(401).json({ message: "Not authenticated" });
    if (!roles.includes(req.user.role))
        return res.status(403).json({ message: "Forbidden" });
    next();
};
exports.requireRole = requireRole;
