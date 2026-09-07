export type RoleName =
  | "system_admin"
  | "owner"
  | "maintainer"
  | "admin"
  | "treasurer"
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
  // Snapshot of the user's token_version at sign time. authMiddleware
  // compares this against the current DB value on every request — a
  // mismatch means the token was revoked (logout, forced sign-out) even
  // though it hasn't naturally expired yet.
  tokenVersion: number;
  // Unix seconds when this session first began (set once, at login, and
  // carried forward unchanged through every sliding-session refresh and
  // through change-password's re-issue). authMiddleware uses this — not the
  // current token's own iat — to enforce an absolute session lifetime, so
  // an active session can't be kept alive forever just by staying active.
  sessionStartedAt: number;
  // True right after an admin/owner/system_admin resets this user's
  // password. authMiddleware blocks every route except /auth/me,
  // /auth/logout, and /auth/force-password-reset while this is true, and
  // it's only ever cleared by completing that endpoint — never by a plain
  // token refresh, so it can't quietly expire out from under the block.
  mustResetPassword: boolean;
}
