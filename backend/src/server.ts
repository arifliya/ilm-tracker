import { app } from "./app";
import { env } from "./config/env";
import { pool } from "./config/db";
import { logger } from "./utils/logger";

const server = app.listen(env.PORT, () => {
  logger.info(`Backend listening on port ${env.PORT}`);
});

// On a rolling deploy/restart, the process manager sends SIGTERM and
// expects the process to finish up and exit on its own — without this, a
// request that's mid-flight when the container gets killed just drops.
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);
  server.close(async closeErr => {
    if (closeErr) {
      logger.error({ err: closeErr }, "Error closing HTTP server");
    }
    try {
      await pool.end();
    } catch (poolErr) {
      logger.error({ err: poolErr }, "Error closing DB pool");
    }
    process.exit(closeErr ? 1 : 0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
