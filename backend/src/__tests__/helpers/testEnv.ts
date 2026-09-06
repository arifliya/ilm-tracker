import type { Bindings } from "../../types/env";

// Passed as app.request(path, init, testEnv)'s third argument in every
// test — stands in for wrangler.toml's [vars]/secrets/bindings, since
// Workers config is per-request (c.env), not a process-wide import the
// way Express's dotenv-based config used to be. DATABASE_URL/RATE_LIMIT_KV
// are never actually touched in tests (config/db.ts and any KV-backed
// rate limiter are mocked at the module level instead), so they're just
// typed placeholders.
export const TEST_JWT_SECRET = "test-jwt-secret";

export const testEnv: Bindings = {
  DATABASE_URL: "postgres://test-not-used",
  RATE_LIMIT_KV: {} as unknown as Bindings["RATE_LIMIT_KV"],
  JWT_SECRET: TEST_JWT_SECRET,
  DIRECT_DEBIT_WEBHOOK_SECRET: "test-direct-debit-webhook-secret",
  COOKIE_SECURE: "true",
  CORS_ORIGIN: "http://localhost:5173",
  NODE_ENV: "test"
};
