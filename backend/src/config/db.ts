import mysql from "mysql2/promise";
import { env } from "./env";
import { logger } from "../utils/logger";

const CONNECTION_LIMIT = 10;

// mysql2 has no pool-wide per-query timeout option — only `connectTimeout`
// (below), which bounds connection *setup*, not a slow query on an
// already-open connection. To stop a runaway query from hanging a request
// forever, `pool.query`/`pool.execute` are wrapped below to apply a default
// client-side timeout to every call: if the server hasn't responded within
// this window, mysql2 destroys the underlying connection and the call
// rejects instead of hanging indefinitely.
const DEFAULT_QUERY_TIMEOUT_MS = 15_000;

export const pool = mysql.createPool({
  host: env.DB_HOST,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: CONNECTION_LIMIT,
  // How long to wait when establishing a new connection before giving up,
  // so a stalled/unreachable DB fails fast with a 500 instead of hanging
  // the request indefinitely.
  connectTimeout: 10_000
});

// --- Monitoring --------------------------------------------------------
// mysql2 exposes pool health as lifecycle events, not a stats API. Track
// them so saturation is visible in logs (a warning the moment a request has
// to queue for a connection) and queryable at runtime via getPoolStats(),
// rather than only showing up indirectly as slow/timed-out requests.
let activeConnections = 0;
let totalConnections = 0;
let enqueuedCount = 0;

pool.on("connection", () => {
  totalConnections += 1;
});
pool.on("acquire", () => {
  activeConnections += 1;
});
pool.on("release", () => {
  activeConnections = Math.max(0, activeConnections - 1);
});
pool.on("enqueue", () => {
  enqueuedCount += 1;
  logger.warn(
    { activeConnections, totalConnections, connectionLimit: CONNECTION_LIMIT, enqueuedCount },
    "DB pool exhausted — request queued waiting for a connection"
  );
});

export const getPoolStats = () => ({
  activeConnections,
  totalConnections,
  connectionLimit: CONNECTION_LIMIT,
  enqueuedCount
});

// --- Per-query timeout ---------------------------------------------------
const withDefaultTimeout =
  (raw: (...args: any[]) => any) =>
  (sql: unknown, values?: unknown) => {
    const options =
      typeof sql === "string"
        ? { sql, timeout: DEFAULT_QUERY_TIMEOUT_MS }
        : { timeout: DEFAULT_QUERY_TIMEOUT_MS, ...(sql as object) };
    return raw(options, values);
  };

pool.query = withDefaultTimeout(pool.query.bind(pool)) as typeof pool.query;
pool.execute = withDefaultTimeout(pool.execute.bind(pool)) as typeof pool.execute;

// getConnection() hands out a raw PoolConnection (used for transactions,
// e.g. notifications.ts) whose .query/.execute bypass the wrapping above —
// apply the same default timeout to those too.
const rawGetConnection = pool.getConnection.bind(pool);
pool.getConnection = (async () => {
  const conn = await rawGetConnection();
  conn.query = withDefaultTimeout(conn.query.bind(conn)) as typeof conn.query;
  conn.execute = withDefaultTimeout(conn.execute.bind(conn)) as typeof conn.execute;
  return conn;
}) as typeof pool.getConnection;
