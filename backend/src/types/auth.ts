import { Request } from "express";

export type RoleName =
  | "system_admin"
  | "owner"
  | "maintainer"
  | "admin"
  | "teacher"
  | "parent"
  | "student"
  | "staff"
  | "pending";

export interface JwtPayload {
  userId: number;
  username: string;
  role: RoleName;
  schoolId: number | null;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}
