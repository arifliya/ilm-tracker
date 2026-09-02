"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const pino_http_1 = __importDefault(require("pino-http"));
const env_1 = require("./config/env");
const db_1 = require("./config/db");
const logger_1 = require("./utils/logger");
const httpError_1 = require("./utils/httpError");
const auth_1 = __importDefault(require("./routes/auth"));
const admin_1 = __importDefault(require("./routes/admin"));
const parent_1 = __importDefault(require("./routes/parent"));
const teacher_1 = __importDefault(require("./routes/teacher"));
const student_1 = __importDefault(require("./routes/student"));
const systemAdmin_1 = __importDefault(require("./routes/systemAdmin"));
const features_1 = __importDefault(require("./routes/features"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const notes_1 = __importDefault(require("./routes/notes"));
const reportCards_1 = __importDefault(require("./routes/reportCards"));
const timetable_1 = __importDefault(require("./routes/timetable"));
const fees_1 = __importDefault(require("./routes/fees"));
exports.app = (0, express_1.default)();
exports.app.set("trust proxy", env_1.env.TRUST_PROXY);
// This is a pure JSON API — the frontend is a separate nginx-served app —
// so helmet's CSP/frame/HSTS defaults matter less here than they would for
// an app serving HTML, but they're still the right default: no reason for
// an API response to ever be framed, sniffed, or served over downgraded
// HTTP if a header can prevent it for free.
exports.app.use((0, helmet_1.default)());
// Request-level logging (method, url, status, response time) — replaces
// the ad hoc console.log tracing that used to live nowhere in particular.
// /healthz is polled every 30s by the Docker healthcheck, so it's excluded
// or it'd drown out everything else in the log.
exports.app.use((0, pino_http_1.default)({
    logger: logger_1.logger,
    autoLogging: { ignore: req => req.url === "/healthz" }
}));
exports.app.use((0, cors_1.default)({
    origin: env_1.env.CORS_ORIGIN,
    credentials: true
}));
exports.app.use((0, cookie_parser_1.default)());
exports.app.use(express_1.default.json({
    limit: "5mb",
    // Stashes the raw bytes alongside the parsed body — the direct-debit
    // provider webhook (fees.ts) verifies an HMAC signature over the exact
    // raw payload, which a re-serialized req.body wouldn't reliably match.
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString("utf8");
    }
}));
exports.app.use(express_1.default.urlencoded({ extended: true, limit: "5mb" }));
exports.app.get("/", (_req, res) => {
    res.json({ message: "ilm backend running" });
});
// Readiness check for orchestration (Docker healthcheck, load balancers,
// k8s probes, ...) — unlike "/", this actually confirms the DB is
// reachable, since a process that's up but can't reach its DB should be
// taken out of rotation, not treated as healthy.
exports.app.get("/healthz", async (_req, res) => {
    try {
        await db_1.pool.query("SELECT 1");
        res.status(200).json({ status: "ok", pool: (0, db_1.getPoolStats)() });
    }
    catch (err) {
        logger_1.logger.error({ err }, "Health check failed");
        res.status(503).json({ status: "error", pool: (0, db_1.getPoolStats)() });
    }
});
exports.app.use("/api/auth", auth_1.default);
exports.app.use("/api/admin", admin_1.default);
exports.app.use("/api/parent", parent_1.default);
exports.app.use("/api/teacher", teacher_1.default);
exports.app.use("/api/student", student_1.default);
exports.app.use("/api/system-admin", systemAdmin_1.default);
exports.app.use("/api/features", features_1.default);
exports.app.use("/api/notifications", notifications_1.default);
exports.app.use("/api/notes", notes_1.default);
exports.app.use("/api/report-cards", reportCards_1.default);
exports.app.use("/api/timetable", timetable_1.default);
exports.app.use("/api/fees", fees_1.default);
// Single exit point for every error a route throws (routes are wrapped in
// asyncHandler, so a rejected promise lands here via next(err) instead of
// hanging). A route that needs a specific status/message throws HttpError;
// anything else is treated as unexpected and only gets its detail exposed
// outside production, so a stack trace never leaks to a real client.
exports.app.use((err, req, res, _next) => {
    (req.log || logger_1.logger).error({ err }, "Unhandled error");
    if (err instanceof httpError_1.HttpError) {
        return res.status(err.statusCode).json({ message: err.message });
    }
    res.status(500).json({
        message: env_1.env.NODE_ENV === "production" ? "Internal server error" : err?.message || "Internal server error"
    });
});
