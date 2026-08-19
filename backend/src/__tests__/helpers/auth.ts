import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { RoleName } from "../../types/auth";

export const authCookie = (payload: {
  userId: number;
  username?: string;
  role: RoleName;
  schoolId: number | null;
}) => {
  const token = jwt.sign(
    {
      userId: payload.userId,
      username: payload.username ?? "testuser",
      role: payload.role,
      schoolId: payload.schoolId
    },
    env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  return `token=${token}`;
};
