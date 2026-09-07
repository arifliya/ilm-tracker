import type { Context } from "hono";
import type { AppEnv } from "../types/env";

// Workers config comes from c.env (wrangler.toml [vars]/secrets, or
// backend/.dev.vars locally) — there's no process-wide env object to
// import the way Express's dotenv-based config/env.ts used to provide.
export function requireEnv(
  c: Context<AppEnv>,
  name: "JWT_SECRET" | "DIRECT_DEBIT_WEBHOOK_SECRET"
): string {
  const value = c.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Set it with \`wrangler secret put ${name}\` (or add it to backend/.dev.vars for local dev).`
    );
  }
  return value;
}

export function isCookieSecure(c: Context<AppEnv>): boolean {
  return c.env.COOKIE_SECURE === "true";
}

// Comma-separated list of allowed frontend origins, e.g.
// "https://app.example.com,https://staging.example.com"
export function corsOrigins(c: Context<AppEnv>): string[] {
  return (c.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
}

// Every Cloudflare Pages branch-preview deployment gets its own
// "<branch-name>.<project>.pages.dev" alias — a new one every time a
// feature branch is created, renamed, or replaced. Hardcoding each of
// those into CORS_ORIGIN as they come and go means it permanently
// accumulates stale entries for branches that no longer exist (the
// original version of this list still had one from a renamed branch
// months after that branch was gone). Since any subdomain of a
// configured origin's own hostname is still a deployment under our own
// Cloudflare Pages project — not an origin an attacker could ever
// control — trusting the whole subdomain tree of each configured origin
// covers every past/future preview and staging alias automatically, so
// nothing ever needs to be added or cleaned up by hand again.
export function isOriginAllowed(configuredOrigins: string[], origin: string): boolean {
  return configuredOrigins.some(allowed => {
    if (origin === allowed) return true;
    try {
      const allowedHost = new URL(allowed).hostname;
      const originUrl = new URL(origin);
      return originUrl.protocol === new URL(allowed).protocol && originUrl.hostname.endsWith(`.${allowedHost}`);
    } catch {
      return false;
    }
  });
}
