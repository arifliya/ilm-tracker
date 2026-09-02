import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";

import { env } from "./config/env";
import { pool, getPoolStats } from "./config/db";
import { logger } from "./utils/logger";
import { HttpError } from "./utils/httpError";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import parentRoutes from "./routes/parent";
import teacherRoutes from "./routes/teacher";
import studentRoutes from "./routes/student";
import systemAdminRoutes from "./routes/systemAdmin";
import featuresRoutes from "./routes/features";
import notificationsRoutes from "./routes/notifications";
import notesRoutes from "./routes/notes";
import reportCardsRoutes from "./routes/reportCards";
import timetableRoutes from "./routes/timetable";
import feesRoutes from "./routes/fees";

export const app = express();

app.set("trust proxy", env.TRUST_PROXY);

// This is a pure JSON API — the frontend is a separate nginx-served app —
// so helmet's CSP/frame/HSTS defaults matter less here than they would for
// an app serving HTML, but they're still the right default: no reason for
// an API response to ever be framed, sniffed, or served over downgraded
// HTTP if a header can prevent it for free.
app.use(helmet());

// Request-level logging (method, url, status, response time) — replaces
// the ad hoc console.log tracing that used to live nowhere in particular.
// /healthz is polled every 30s by the Docker healthcheck, so it's excluded
// or it'd drown out everything else in the log.
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: req => req.url === "/healthz" }
  })
);

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  })
);

app.use(cookieParser());
app.use(
  express.json({
    limit: "5mb",
    // Stashes the raw bytes alongside the parsed body — the direct-debit
    // provider webhook (fees.ts) verifies an HMAC signature over the exact
    // raw payload, which a re-serialized req.body wouldn't reliably match.
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.get("/", (_req, res) => {
  res.json({ message: "ilm backend running" });
});

// Readiness check for orchestration (Docker healthcheck, load balancers,
// k8s probes, ...) — unlike "/", this actually confirms the DB is
// reachable, since a process that's up but can't reach its DB should be
// taken out of rotation, not treated as healthy.
app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", pool: getPoolStats() });
  } catch (err) {
    logger.error({ err }, "Health check failed");
    res.status(503).json({ status: "error", pool: getPoolStats() });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/system-admin", systemAdminRoutes);
app.use("/api/features", featuresRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/report-cards", reportCardsRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/fees", feesRoutes);

// Single exit point for every error a route throws (routes are wrapped in
// asyncHandler, so a rejected promise lands here via next(err) instead of
// hanging). A route that needs a specific status/message throws HttpError;
// anything else is treated as unexpected and only gets its detail exposed
// outside production, so a stack trace never leaks to a real client.
app.use((err: any, req: any, res: any, _next: any) => {
  (req.log || logger).error({ err }, "Unhandled error");

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  res.status(500).json({
    message: env.NODE_ENV === "production" ? "Internal server error" : err?.message || "Internal server error"
  });
});
