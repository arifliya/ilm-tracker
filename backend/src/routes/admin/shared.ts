import type { Context } from "hono";
import { requireRole } from "../../middleware/auth";
import type { DbConnection } from "../../config/db";
import type { JwtPayload } from "../../types/auth";
import type { AppEnv } from "../../types/env";

const STAFF_MGMT = requireRole("admin", "owner", "system_admin");
const USER_MGMT = requireRole("owner", "maintainer", "system_admin");
const REPORT_ROLES = requireRole("admin", "owner");
// Deliberately narrower than every other gate in this file — bulk student
// import is restricted to the school's own admin only, not owner or
// system_admin, per the product decision behind this feature.
const ADMIN_ONLY = requireRole("admin");

const isNonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const MAX_BULK_UPLOAD_ROWS = 500;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * system_admin is the one platform-level role with no single school — every
 * other role (owner/admin/maintainer/teacher/parent/student) is confined to
 * user.schoolId. These helpers keep that rule consistent across every
 * school-scoped endpoint below instead of repeating the branch inline.
 */
const isPlatformWide = (user: JwtPayload) => user.role === "system_admin";

const inRequesterScope = (user: JwtPayload, targetSchoolId: number | null) => {
  if (isPlatformWide(user)) return true;
  return targetSchoolId !== null && targetSchoolId === user.schoolId;
};

// Shared single-column lookup shapes, reused across every small helper and
// existence check below — `id` in particular is the same shape (a bare
// identity-column select) regardless of which table it's selected from.
interface IdRow {
  id: number;
}
interface SchoolIdRow {
  school_id: number;
}
interface NullableSchoolIdRow {
  school_id: number | null;
}
interface SchoolCodeRow {
  school_code: string;
}
interface RequestedRoleRow {
  requested_role: string | null;
}
interface RoleNameRow {
  name: string;
}
// Postgres returns COUNT(*)/aggregate columns as strings in the driver's
// default row mode, not numbers — every use below already relies on that
// (compares via Number(...) or JS's implicit string-to-number coercion for
// relational operators), so this is typed to match reality rather than
// what the column "sounds like".
interface CountRow {
  cnt: string;
}

const getClassSchoolId = async (db: DbConnection, classId: string | number): Promise<number | null> => {
  const { rows } = await db.query<SchoolIdRow>("SELECT school_id FROM classes WHERE id = $1", [classId]);
  return rows[0]?.school_id ?? null;
};

const getSchoolCode = async (db: DbConnection, schoolId: string | number): Promise<string | null> => {
  const { rows } = await db.query<SchoolCodeRow>("SELECT school_code FROM schools WHERE id = $1", [schoolId]);
  return rows[0]?.school_code ?? null;
};

/**
 * Class codes are always "<school_code>-<admin-chosen suffix>" so a code is
 * self-describing about which school it belongs to. The admin only ever
 * types the suffix; this builds (and re-derives, on edit) the full code.
 */
const buildClassCode = (schoolCode: string, suffix: string) => `${schoolCode}-${suffix.trim()}`;

const getUserSchoolId = async (db: DbConnection, userId: string | number): Promise<number | null> => {
  const { rows } = await db.query<NullableSchoolIdRow>("SELECT school_id FROM users WHERE id = $1", [userId]);
  return rows[0]?.school_id ?? null;
};

const getUserRequestedRole = async (db: DbConnection, userId: string | number): Promise<string | null> => {
  const { rows } = await db.query<RequestedRoleRow>("SELECT requested_role FROM users WHERE id = $1", [userId]);
  return rows[0]?.requested_role ?? null;
};

const getUserRoleName = async (db: DbConnection, userId: string | number): Promise<string | null> => {
  const { rows } = await db.query<RoleNameRow>(
    "SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1",
    [userId]
  );
  return rows[0]?.name ?? null;
};

const getStudentSchoolId = async (db: DbConnection, studentId: string | number): Promise<number | null> => {
  const { rows } = await db.query<SchoolIdRow>("SELECT school_id FROM students WHERE id = $1", [studentId]);
  return rows[0]?.school_id ?? null;
};

const getParentSchoolId = async (db: DbConnection, parentId: string | number): Promise<number | null> => {
  const { rows } = await db.query<SchoolIdRow>("SELECT school_id FROM parents WHERE id = $1", [parentId]);
  return rows[0]?.school_id ?? null;
};

/**
 * Detaches an active/approved user from every row that references it
 * (parents/staff_details have user_id FKs with no ON DELETE CASCADE, so
 * deleting straight from users otherwise 500s). Refuses to touch a
 * parent's profile while they still have children on file, matching
 * /remove-parent/:id's existing "remove students first" behavior — this
 * path is for approved accounts, so it must not silently drop real
 * enrolled children.
 */
const detachUserDependencies = async (
  db: DbConnection,
  userId: number
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const { rows: parentRows } = await db.query<IdRow>("SELECT id FROM parents WHERE user_id = $1", [userId]);
  const parent = parentRows[0];

  if (parent) {
    const { rows: countRows } = await db.query<CountRow>(
      "SELECT COUNT(*) AS cnt FROM student_guardians WHERE parent_id = $1 AND status = 'approved'",
      [parent.id]
    );
    if (Number(countRows[0]?.cnt) > 0) {
      return { ok: false, message: "Remove all linked students before removing this user" };
    }
    await db.query("DELETE FROM parents WHERE id = $1", [parent.id]);
  }

  await db.query("DELETE FROM staff_details WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM teacher_classes WHERE teacher_id = $1", [userId]);
  await db.query("UPDATE students SET user_id = NULL WHERE user_id = $1", [userId]);

  return { ok: true };
};

/**
 * Shared query-param parsing for the endpoints below that serve both a
 * dropdown source (fetched with no params — full, unpaginated result, the
 * original response shape) and a browsable table (fetched with page/
 * pageSize — paginated, `{ items, total }` shape). `paginated` tells the
 * caller which mode was requested; the caller still has to branch on it
 * since only it knows its own response shape.
 */
interface PageParams {
  paginated: boolean;
  page: number;
  pageSize: number;
  search: string;
  sortDir: "ASC" | "DESC";
}

const parsePageParams = (c: Context<AppEnv>, defaultPageSize: number, maxPageSize: number): PageParams => {
  const paginated = c.req.query("page") !== undefined || c.req.query("pageSize") !== undefined;
  const pageParam = Number(c.req.query("page"));
  const page = Number.isInteger(pageParam) && pageParam >= 0 ? pageParam : 0;
  const pageSizeParam = Number(c.req.query("pageSize"));
  const pageSize =
    Number.isInteger(pageSizeParam) && pageSizeParam > 0 ? Math.min(pageSizeParam, maxPageSize) : defaultPageSize;
  const search = (c.req.query("search") || "").trim();
  const sortDir = c.req.query("sort") === "za" ? "DESC" : "ASC";
  return { paginated, page, pageSize, search, sortDir };
};

export {
  STAFF_MGMT,
  USER_MGMT,
  REPORT_ROLES,
  ADMIN_ONLY,
  isNonEmpty,
  MAX_BULK_UPLOAD_ROWS,
  DATE_RE,
  todayStr,
  daysAgoStr,
  isPlatformWide,
  inRequesterScope,
  getClassSchoolId,
  getSchoolCode,
  buildClassCode,
  getUserSchoolId,
  getUserRequestedRole,
  getUserRoleName,
  getStudentSchoolId,
  getParentSchoolId,
  detachUserDependencies,
  parsePageParams
};
export type {
  IdRow,
  SchoolIdRow,
  NullableSchoolIdRow,
  SchoolCodeRow,
  RequestedRoleRow,
  RoleNameRow,
  CountRow,
  PageParams
};
