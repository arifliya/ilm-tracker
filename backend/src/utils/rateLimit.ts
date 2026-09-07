import type { Context } from "hono";
import type { AppEnv } from "../types/env";

// Jest runs on real Node (via ts-jest), so JEST_WORKER_ID is genuinely set
// there — mirrors logger.ts's isTest() so rate limiting doesn't interfere
// with tests firing far more requests per file than any real client would
// in the same window, same spirit as express-rate-limit's old `skip:
// isTestEnv` option. This only ever catches the Jest run itself — Jest's
// mocked-DB unit tests never reach a real Worker at all, so this check has
// nothing to do with an E2E run hitting a real `wrangler dev` instance
// (that's a genuinely separate process, with its own `c.env`, not Jest's
// Node process) — see the `c.env.NODE_ENV === "test"` check below for that
// case instead.
const isTestEnv = (): boolean => {
  try {
    return typeof process !== "undefined" && !!process.env?.JEST_WORKER_ID;
  } catch {
    return false;
  }
};

// Approximate, Workers-KV-backed rate limiting. Registration and
// change-password rely on this as their only limiter, since the Free
// plan's single native Cloudflare Rate Limiting Rule is spent on
// /auth/login — the tightest, highest-value brute-force target. Login
// uses this too, as a fallback behind that edge rule: the edge rule lives
// in the Cloudflare dashboard, not this repo, so it's untested and could
// simply be absent in some environment. KV is eventually consistent
// (writes can take up to ~60s to propagate), so this is an approximation,
// not an exact counter — acceptable given each threshold already has
// headroom built in. If this project moves to Workers Paid later, upgrade
// to a Durable-Object-backed counter for exact per-key counting instead.
export const checkRateLimit = async (
  c: Context<AppEnv>,
  opts: { key: string; limit: number; windowSeconds: number }
): Promise<boolean> => {
  // A real Worker (wrangler dev), not Jest — the E2E suite's own exemption.
  // scripts/run-e2e.sh passes this via `wrangler dev --var NODE_ENV:test`
  // for exactly this run, so a routine `npm run dev` still enforces real
  // limits.
  if (isTestEnv() || c.env.NODE_ENV === "test") return true;

  // The same exemption for a real deployed environment (staging): NODE_ENV
  // there is "staging", not "test" (it has to behave like a real
  // environment for everything else), so this suite's 40+ journeys — each
  // logging in fresh — trip the 10-per-15-min login limit almost
  // immediately. E2E_TEST_BYPASS_SECRET is only ever set as a Worker
  // secret on staging (see wrangler.toml/staging.yml); it's never set in
  // production, so this branch can never fire there no matter what header
  // a real request sends — the check fails safe (both sides must be
  // non-empty and match) rather than open on a missing/misconfigured
  // secret.
  const bypassSecret = c.env.E2E_TEST_BYPASS_SECRET;
  if (bypassSecret && c.req.header("X-E2E-Bypass-Token") === bypassSecret) return true;

  const ip = c.req.header("CF-Connecting-IP");
  // Cloudflare's edge always sets this header on real traffic — it isn't
  // client-controllable, so it's only ever absent when a request reaches
  // the Worker without going through Cloudflare's proxy (local dev,
  // `wrangler dev`, a direct-to-Worker test). Falling back to a shared
  // "unknown" bucket there would let one such request exhaust the limit
  // for every other client that also lacks the header — worse than not
  // rate limiting at all, and there's no real adversarial traffic to
  // defend against in that situation anyway.
  if (!ip) return true;

  const kvKey = `ratelimit:${opts.key}:${ip}`;
  const kv = c.env.RATE_LIMIT_KV;

  const current = await kv.get(kvKey);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= opts.limit) return false;

  await kv.put(kvKey, String(count + 1), { expirationTtl: opts.windowSeconds });
  return true;
};
