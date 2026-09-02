import dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy backend/.env.example to backend/.env and fill in a real value.`
    );
  }
  return value;
}

// Express's `trust proxy` setting, which determines how far to trust
// X-Forwarded-* headers — this is what req.ip (and therefore the login/
// registration rate limiters) actually reads. Defaults to false (trust
// nothing), which is correct when the backend is reached directly, as it
// is in docker-compose today. Set it once this sits behind a real reverse
// proxy/load balancer, to a hop count (e.g. "1" for a single proxy) or a
// specific value Express understands ("loopback", an IP/CIDR list, etc.)
// — see https://expressjs.com/en/guide/behind-proxies.html. Getting this
// wrong in either direction is a real risk: too trusting lets a client
// spoof X-Forwarded-For to dodge rate limits, too little collapses every
// user behind the proxy into one shared rate-limit bucket.
function parseTrustProxy(value: string): boolean | number | string {
  if (value === "true") return true;
  if (value === "false") return false;
  const asNumber = Number(value);
  return value.trim() !== "" && !Number.isNaN(asNumber) ? asNumber : value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 4000,
  DB_HOST: process.env.DB_HOST || "db",
  DB_USER: process.env.DB_USER || "ilmuser",
  DB_PASSWORD: required("DB_PASSWORD"),
  DB_NAME: process.env.DB_NAME || "ilm",
  JWT_SECRET: required("JWT_SECRET"),
  // Signs/verifies the direct-debit provider webhook (see
  // utils/directDebitProvider.ts). Only the stub provider is wired up
  // today, but this is checked the same way a real provider's webhook
  // secret would be, so swapping providers later doesn't touch this.
  DIRECT_DEBIT_WEBHOOK_SECRET: required("DIRECT_DEBIT_WEBHOOK_SECRET"),
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  // Comma-separated list of allowed frontend origins, e.g.
  // "https://app.example.com,https://staging.example.com"
  CORS_ORIGIN: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean),
  TRUST_PROXY: parseTrustProxy(process.env.TRUST_PROXY || "false")
};
