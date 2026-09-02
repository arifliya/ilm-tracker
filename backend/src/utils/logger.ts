import pino from "pino";
import { env } from "../config/env";

// Silent under Jest so `npm test` output stays readable — tests assert on
// HTTP responses, never on log lines. Pretty-printed in development for
// humans reading a terminal; plain JSON in production, which is what a log
// aggregator (CloudWatch, Datadog, etc.) actually wants.
const level = env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug";

export const logger = pino({
  level,
  transport: env.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true } } : undefined
});
