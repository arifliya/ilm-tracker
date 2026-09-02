"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPoolStats = exports.pool = void 0;
const promise_1 = __importDefault(require("mysql2/promise"));
const env_1 = require("./env");
const logger_1 = require("../utils/logger");
const CONNECTION_LIMIT = 10;
// mysql2 has no pool-wide per-query timeout option — only `connectTimeout`
// (below), which bounds connection *setup*, not a slow query on an
// already-open connection. To stop a runaway query from hanging a request
// forever, `pool.query`/`pool.execute` are wrapped below to apply a default
// client-side timeout to every call: if the server hasn't responded within
// this window, mysql2 destroys the underlying connection and the call
// rejects instead of hanging indefinitely.
const DEFAULT_QUERY_TIMEOUT_MS = 15000;
exports.pool = promise_1.default.createPool({
    host: env_1.env.DB_HOST,
    user: env_1.env.DB_USER,
    password: env_1.env.DB_PASSWORD,
    database: env_1.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: CONNECTION_LIMIT,
    // How long to wait when establishing a new connection before giving up,
    // so a stalled/unreachable DB fails fast with a 500 instead of hanging
    // the request indefinitely.
    connectTimeout: 10000
});
// --- Monitoring --------------------------------------------------------
// mysql2 exposes pool health as lifecycle events, not a stats API. Track
// them so saturation is visible in logs (a warning the moment a request has
// to queue for a connection) and queryable at runtime via getPoolStats(),
// rather than only showing up indirectly as slow/timed-out requests.
let activeConnections = 0;
let totalConnections = 0;
let enqueuedCount = 0;
exports.pool.on("connection", () => {
    totalConnections += 1;
});
exports.pool.on("acquire", () => {
    activeConnections += 1;
});
exports.pool.on("release", () => {
    activeConnections = Math.max(0, activeConnections - 1);
});
exports.pool.on("enqueue", () => {
    enqueuedCount += 1;
    logger_1.logger.warn({ activeConnections, totalConnections, connectionLimit: CONNECTION_LIMIT, enqueuedCount }, "DB pool exhausted — request queued waiting for a connection");
});
const getPoolStats = () => ({
    activeConnections,
    totalConnections,
    connectionLimit: CONNECTION_LIMIT,
    enqueuedCount
});
exports.getPoolStats = getPoolStats;
// --- Per-query timeout ---------------------------------------------------
const withDefaultTimeout = (raw) => (sql, values) => {
    const options = typeof sql === "string"
        ? { sql, timeout: DEFAULT_QUERY_TIMEOUT_MS }
        : { timeout: DEFAULT_QUERY_TIMEOUT_MS, ...sql };
    return raw(options, values);
};
exports.pool.query = withDefaultTimeout(exports.pool.query.bind(exports.pool));
exports.pool.execute = withDefaultTimeout(exports.pool.execute.bind(exports.pool));
// getConnection() hands out a raw PoolConnection (used for transactions,
// e.g. notifications.ts) whose .query/.execute bypass the wrapping above —
// apply the same default timeout to those too.
const rawGetConnection = exports.pool.getConnection.bind(exports.pool);
exports.pool.getConnection = (async () => {
    const conn = await rawGetConnection();
    conn.query = withDefaultTimeout(conn.query.bind(conn));
    conn.execute = withDefaultTimeout(conn.execute.bind(conn));
    return conn;
});
