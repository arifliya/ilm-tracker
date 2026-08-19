import dotenv from "dotenv";
dotenv.config();

if (!process.env.JWT_SECRET) {
  console.warn(
    "WARNING: JWT_SECRET is not set — falling back to an insecure default. " +
    "Set JWT_SECRET in the environment before deploying anywhere but local dev."
  );
}

export const env = {
  PORT: process.env.PORT || 4000,
  DB_HOST: process.env.DB_HOST || "db",
  DB_USER: process.env.DB_USER || "ilmuser",
  DB_PASSWORD: process.env.DB_PASSWORD || "ilmpassword",
  DB_NAME: process.env.DB_NAME || "ilm",
  JWT_SECRET: process.env.JWT_SECRET || "supersecretjwt",
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true"
};
