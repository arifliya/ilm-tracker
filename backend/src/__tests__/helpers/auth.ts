import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { RoleName } from "../../types/auth";

export const authCookie = (payload: {
  userId: number;
  username?: string;
  role: RoleName;
  schoolId: number | null;
  tokenVersion?: number;
  sessionStartedAt?: number;
  mustResetPassword?: boolean;
}) => {
  const token = jwt.sign(
    {
      userId: payload.userId,
      username: payload.username ?? "testuser",
      role: payload.role,
      schoolId: payload.schoolId,
      tokenVersion: payload.tokenVersion ?? 0,
      sessionStartedAt: payload.sessionStartedAt ?? Math.floor(Date.now() / 1000),
      mustResetPassword: payload.mustResetPassword ?? false
    },
    env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  return `token=${token}`;
};
