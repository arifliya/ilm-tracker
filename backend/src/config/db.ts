import { neonConfig, Pool, type PoolClient, type QueryResult, type QueryResultRow } from "@neondatabase/serverless";
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env";

// The driver talks to Postgres over WebSocket and, by default, expects
// Neon's own WebSocket-to-Postgres proxy in front of it — real Neon hosts
// provide this automatically. Local dev's Postgres (docker-compose) has no
// such proxy built in, so it sits behind `wsproxy` (Neon's own small Go
// proxy — see docker-compose.yml) instead; this is the only local-dev-only
// branch in this file. DATABASE_URL's host is "db" for that local setup
// (the docker-compose service name wsproxy's container resolves — see
// ALLOW_ADDR_REGEX there) and a real *.neon.tech host everywhere else, so
// that's what distinguishes the two cases here.
function configureForLocalDevIfNeeded(databaseUrl: string) {
  const { hostname } = new URL(databaseUrl);
  if (hostname === "db" || hostname === "localhost" || hostname === "127.0.0.1") {
    // wsproxy (unlike Neon's own production proxy, whose default path this
    // driver otherwise assumes) serves its upgrade endpoint at /v1.
    neonConfig.wsProxy = "localhost:6543/v1";
    neonConfig.useSecureWebSocket = false;
    // The driver's default pipelineConnect="password" speeds up connection
    // setup by pipelining a cleartext password with the startup message —
    // it only works against cleartext password auth, which is how Neon's
    // own backend is set up. Local Postgres uses SCRAM-SHA-256 by default
    // (its own default auth method), whose multi-step challenge/response
    // handshake breaks under that pipelining, so it's disabled here.
    neonConfig.pipelineConnect = false;
  }
}

export type DbConnection = PoolClient;

// @neondatabase/serverless has no per-call timeout option the way mysql2
// did ({sql, timeout}). Wrap query() so every call still gets one without
// every route having to pass it explicitly, so a runaway query fails fast
// with a rejected promise instead of hanging the request indefinitely.
// Ported unchanged in spirit from the mysql2 version — only the
// implementation mechanism (AbortController-style race vs. a driver
// option) differs.
const DEFAULT_QUERY_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Query timeout")), ms);
    })
  ]);
}

// One Pool per request, connected via WebSocket and closed before the
// request ends — not pooled across requests. Unlike the old Hyperdrive
// setup (which pooled upstream so a Worker-level pool would have fought
// it), Neon's WebSocket-backed Pool/Client explicitly cannot outlive a
// single request in a Workers-style environment: it must be created,
// used, and closed within the one request handler. Because there's
// already exactly one connection for the whole request, transactions
// (reportCards.ts, admin.ts bulk-upload, parent.ts, auth.ts,
// notifications.ts) run as raw `BEGIN`/`COMMIT`/`ROLLBACK` queries
// directly on c.get("db") — no separate getConnection()/release() step
// beyond the one client checkout dbMiddleware already does.
export const dbMiddleware = async (c: Context<AppEnv>, next: Next) => {
  configureForLocalDevIfNeeded(c.env.DATABASE_URL);
  const pool = new Pool({ connectionString: c.env.DATABASE_URL });
  const client = await pool.connect();
  // client.query is heavily overloaded (pg supports callback-style calls
  // that return void alongside the promise-style calls this codebase
  // always uses) — pin the rebound reference to the promise-returning
  // shape explicitly, since a plain `.bind()` would infer the full
  // overloaded union and lose the Promise return type.
  const rawQuery = client.query.bind(client) as <R extends QueryResultRow = any>(
    text: string,
    values?: unknown[]
  ) => Promise<QueryResult<R>>;
  client.query = ((text: string, values?: unknown[]) =>
    withTimeout(rawQuery(text, values), DEFAULT_QUERY_TIMEOUT_MS)) as typeof client.query;
  c.set("db", client);

  try {
    await next();
  } finally {
    client.release();
    // Deferred via waitUntil so closing the pool doesn't add to this
    // request's response latency.
    c.executionCtx.waitUntil(pool.end());
  }
};
