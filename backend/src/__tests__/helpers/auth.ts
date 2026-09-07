import { sign } from "hono/jwt";
import type { RoleName } from "../../types/auth";
import { TEST_JWT_SECRET } from "./testEnv";

// hono/jwt's sign() is async (WebCrypto-based), unlike jsonwebtoken's sync
// sign — so unlike the old helper, every call site needs `await`.
export const authCookie = async (payload: {
  userId: number;
  username?: string;
  role: RoleName;
  schoolId: number | null;
  tokenVersion?: number;
  sessionStartedAt?: number;
  mustResetPassword?: boolean;
}) => {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
    {
      userId: payload.userId,
      username: payload.username ?? "testuser",
      role: payload.role,
      schoolId: payload.schoolId,
      tokenVersion: payload.tokenVersion ?? 0,
      sessionStartedAt: payload.sessionStartedAt ?? now,
      mustResetPassword: payload.mustResetPassword ?? false,
      iat: now,
      exp: now + 3600
    },
    TEST_JWT_SECRET
  );
  return `token=${token}`;
};
