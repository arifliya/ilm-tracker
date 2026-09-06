import type { PoolClient } from "@neondatabase/serverless";
import type { JwtPayload } from "./auth";

// Cloudflare bindings + vars, configured in wrangler.toml (and
// backend/.dev.vars for local dev). Read via c.env — there is no
// process-wide singleton the way Express's config/env.ts used to export,
// since Workers config is per-request/per-isolate, not process-global.
export interface Bindings {
  DATABASE_URL: string;
  RATE_LIMIT_KV: KVNamespace;
  JWT_SECRET: string;
  DIRECT_DEBIT_WEBHOOK_SECRET: string;
  COOKIE_SECURE: string;
  CORS_ORIGIN: string;
  NODE_ENV: string;
  // Optional — only ever set on staging (see rateLimit.ts's checkRateLimit
  // and wrangler.toml's comment). Left unset in production, so the bypass
  // it enables can never fire there regardless of what header a request
  // sends.
  E2E_TEST_BYPASS_SECRET?: string;
}

// Request-scoped values set by middleware (config/db.ts's dbMiddleware,
// middleware/auth.ts's authMiddleware) and read by every route downstream.
export interface Variables {
  db: PoolClient;
  user?: JwtPayload;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
