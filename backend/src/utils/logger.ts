// Minimal structured logger for Workers — there's no persistent process to
// pretty-print for and no worker-thread transport support the way
// pino-pretty needed, so this always emits single-line JSON, captured by
// `wrangler tail`/Workers Logs. Keeps the same call-site shape used
// throughout the codebase (`logger.info({...}, "message")`) so no route
// file's log calls need touching.
type Fields = Record<string, unknown>;

// Jest runs this on real Node (via ts-jest), so process.env.JEST_WORKER_ID
// is genuinely set there; the try/catch guards against `process` not
// existing at all in a context where nodejs_compat isn't in play.
const isTest = (): boolean => {
  try {
    return typeof process !== "undefined" && !!process.env?.JEST_WORKER_ID;
  } catch {
    return false;
  }
};

const write = (level: string, fields: Fields, message?: string) => {
  if (isTest()) return;
  console.log(JSON.stringify({ level, msg: message, time: new Date().toISOString(), ...fields }));
};

export const logger = {
  debug: (fields: Fields, message?: string) => write("debug", fields, message),
  info: (fields: Fields, message?: string) => write("info", fields, message),
  warn: (fields: Fields, message?: string) => write("warn", fields, message),
  error: (fields: Fields, message?: string) => write("error", fields, message)
};
