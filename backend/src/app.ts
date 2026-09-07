import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types/env";
import { dbMiddleware } from "./config/db";
import { corsOrigins, isOriginAllowed } from "./config/env";
import { logger } from "./utils/logger";
import { HttpError } from "./utils/httpError";
import featuresRoutes from "./routes/features";
import studentRoutes from "./routes/student";
import notesRoutes from "./routes/notes";
import notificationsRoutes from "./routes/notifications";
import teacherRoutes from "./routes/teacher";
import reportCardsRoutes from "./routes/reportCards";
import systemAdminRoutes from "./routes/systemAdmin";
import parentRoutes from "./routes/parent";
import timetableRoutes from "./routes/timetable";
import feesRoutes from "./routes/fees";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";

export const app = new Hono<AppEnv>();

// Request-level logging (method, path, status, duration) — replaces
// pino-http's autoLogging. /healthz would otherwise be polled frequently
// enough by uptime checks to drown out everything else, so it's excluded,
// same as before.
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  if (c.req.path !== "/healthz") {
    logger.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, durationMs: Date.now() - start },
      "request"
    );
  }
});

// A handful of helmet's defaults that still matter for a pure JSON API
// behind CORS — cheap to keep, no reason to drop them just because helmet
// itself (a Node/Express package) doesn't run here.
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "no-referrer");
});

// CORS config depends on c.env (per-request), so this can't be a
// module-level `app.use("*", cors({...}))` the way it could when env was a
// process-wide import — it's built fresh per request instead.
app.use("*", async (c, next) => {
  const corsMiddleware = cors({
    // A function, not the plain list directly — this also trusts every
    // subdomain of each configured origin (Cloudflare Pages branch-
    // preview aliases), not just exact matches. See isOriginAllowed's own
    // comment for why.
    origin: origin => (isOriginAllowed(corsOrigins(c), origin) ? origin : undefined),
    credentials: true
  });
  return corsMiddleware(c, next);
});

// CSRF is currently only implicit — CORS_ORIGIN blocks a cross-origin
// fetch/XHR carrying credentials, but that protection depends entirely on
// every route reading its body via c.req.json(). A plain cross-site HTML
// <form> POST with one of the three CORS-"safelisted" content types
// (application/x-www-form-urlencoded, multipart/form-data, text/plain)
// never triggers a preflight and isn't subject to the Origin check at
// all — the browser just sends it, cookies included. Nothing in this app
// reads a form-encoded body today, so nothing is actually exploitable yet,
// but nothing stops a future route from doing so and silently reopening
// this hole. Rejecting those three content types outright on every
// mutating request closes it now, rather than relying on every future
// route author to remember to require JSON.
//
// The one exception is the direct-debit webhook: it's an unauthenticated,
// signature-verified server-to-server callback with no session cookie to
// forge in the first place, so CSRF doesn't apply to it, and it
// legitimately reads a raw (non-JSON) body to compute that signature.
const FORM_CONTENT_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];
const CSRF_EXEMPT_PATHS = ["/api/fees/webhooks/direct-debit"];

app.use("*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !CSRF_EXEMPT_PATHS.includes(c.req.path)) {
    const contentType = (c.req.header("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (FORM_CONTENT_TYPES.includes(contentType)) {
      return c.json({ message: "Unsupported content type" }, 415);
    }
  }
  await next();
});

app.use("*", dbMiddleware);

app.get("/", c => c.json({ message: "ilm backend running" }));

// Readiness check — unlike "/", this actually confirms the DB is
// reachable, since a Worker that's up but can't reach Neon should be
// treated as unhealthy. No pool-stats field anymore: a request-scoped
// connection has no pool to report on — that visibility moved to Neon's
// own console/monitoring.
app.get("/healthz", async c => {
  try {
    await c.get("db").query("SELECT 1");
    return c.json({ status: "ok" }, 200);
  } catch (err) {
    logger.error({ err }, "Health check failed");
    return c.json({ status: "error" }, 503);
  }
});

// Route mounts are added incrementally here as each route file is ported.
app.route("/api/features", featuresRoutes);
app.route("/api/student", studentRoutes);
app.route("/api/notes", notesRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/teacher", teacherRoutes);
app.route("/api/report-cards", reportCardsRoutes);
app.route("/api/system-admin", systemAdminRoutes);
app.route("/api/parent", parentRoutes);
app.route("/api/timetable", timetableRoutes);
app.route("/api/fees", feesRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);

// Single exit point for every error a route throws — Hono funnels both
// thrown errors and rejected promises from an async handler here natively,
// so there's no asyncHandler wrapper to apply per-route the way Express
// needed. A route that needs a specific status/message throws HttpError;
// anything else is treated as unexpected and only gets its detail exposed
// outside production, so a stack trace never leaks to a real client.
app.onError((err, c) => {
  logger.error({ err }, "Unhandled error");

  if (err instanceof HttpError) {
    return c.json({ message: err.message }, err.statusCode as any);
  }

  return c.json(
    {
      message:
        c.env.NODE_ENV === "production" ? "Internal server error" : err?.message || "Internal server error"
    },
    500
  );
});

app.notFound(c => c.json({ message: "Not found" }, 404));

export default app;
