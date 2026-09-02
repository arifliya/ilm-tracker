"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const db_1 = require("./config/db");
const logger_1 = require("./utils/logger");
const server = app_1.app.listen(env_1.env.PORT, () => {
    logger_1.logger.info(`Backend listening on port ${env_1.env.PORT}`);
});
// On a rolling deploy/restart, the process manager sends SIGTERM and
// expects the process to finish up and exit on its own — without this, a
// request that's mid-flight when the container gets killed just drops.
function shutdown(signal) {
    logger_1.logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async (closeErr) => {
        if (closeErr) {
            logger_1.logger.error({ err: closeErr }, "Error closing HTTP server");
        }
        try {
            await db_1.pool.end();
        }
        catch (poolErr) {
            logger_1.logger.error({ err: poolErr }, "Error closing DB pool");
        }
        process.exit(closeErr ? 1 : 0);
    });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
