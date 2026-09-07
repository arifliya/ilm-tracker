import { Hono } from "hono";
import type { AppEnv } from "../../types/env";
import bcrypt from "bcryptjs";
import { logger } from "../../utils/logger";
import { authMiddleware } from "../../middleware/auth";
import { isFeatureEnabled } from "../../utils/featureFlags";
import { generateUniqueGuardianCode } from "../../utils/guardianCode";
import { generateTemporaryPassword } from "../../utils/tempPassword";
import { createStudentLogin } from "../../utils/studentAccount";
import { ADMIN_ONLY, isNonEmpty, MAX_BULK_UPLOAD_ROWS } from "./shared";

const router = new Hono<AppEnv>();

interface IdRow {
  id: number;
}

interface ClassCodeRow {
  id: number;
  class_code: string;
}

interface UserEmailRoleRow {
  id: number;
  email: string;
  role_name: string;
  school_id: number | null;
}

/* ============================================================
   BULK STUDENT UPLOAD (CSV, PARSED CLIENT-SIDE) — ADMIN ONLY
   Each row either links to an existing parent (matched by email, within
   this school) as an additional guardian, or creates a brand-new parent
   account. This app has no password-reset/email flow, so a newly-created
   parent's one-time password is generated here and returned in that row's
   result for the admin to relay out of band — never stored anywhere but
   its hash.
   Each row runs its own transaction on the shared request connection, so
   one bad row doesn't roll back the rest of the batch — that per-row
   try/catch deliberately swallows and records the error rather than
   rethrowing, so it stays untouched by the centralized onError handler
   used elsewhere in this file.
   ============================================================ */
router.post("/students/bulk-upload", authMiddleware, ADMIN_ONLY, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const schoolId = user.schoolId;
  const body = await c.req.json();
  const rows = body?.rows;

  if (!Array.isArray(rows) || rows.length === 0) {
    return c.json({ message: "At least one row is required" }, 400);
  }
  if (rows.length > MAX_BULK_UPLOAD_ROWS) {
    return c.json({ message: `Cannot upload more than ${MAX_BULK_UPLOAD_ROWS} rows at once` }, 400);
  }

  const { rows: roleRows } = await db.query<IdRow>("SELECT id FROM roles WHERE name = 'parent'");
  const parentRoleId = roleRows[0]?.id;
  if (!parentRoleId) {
    return c.json({ message: "Parent role missing in DB" }, 500);
  }

  const { rows: studentRoleRows } = await db.query<IdRow>("SELECT id FROM roles WHERE name = 'student'");
  const studentRoleId = studentRoleRows[0]?.id;
  const provisionStudentLogins = await isFeatureEnabled(db, "password_management", schoolId);

  // Every row needs a class-code lookup and a parent-email lookup, and both
  // were previously done one row at a time — 2 sequential round trips per
  // row before that row's transaction even opens, so a full-size batch paid
  // for up to ~1000 serialized queries just on lookups. Both are read-only
  // and independent of any row's outcome, so they're batched into 2 queries
  // total up front instead. The per-row transactional work below (parent
  // create-or-reuse, student insert, guardian/class links, login
  // provisioning) still runs one row at a time on this request's single DB
  // connection — that part is genuinely per-row (conditional on this row's
  // own data and previous rows' side effects within the same batch) and
  // deliberately isolated per row (see comment above), so it can't be
  // collapsed the same way.
  const classCodes = [...new Set(rows.map(r => (isNonEmpty(r?.class_code) ? String(r.class_code).trim() : null)).filter((v): v is string => v !== null))];
  const parentEmails = [...new Set(rows.map(r => (isNonEmpty(r?.parent_email) ? String(r.parent_email).trim() : null)).filter((v): v is string => v !== null))];

  const { rows: classRows } =
    classCodes.length > 0
      ? await db.query<ClassCodeRow>("SELECT id, class_code FROM classes WHERE school_id = $1 AND class_code = ANY($2)", [
          schoolId,
          classCodes
        ])
      : { rows: [] as ClassCodeRow[] };
  const classIdByCode = new Map<string, number>(classRows.map(r => [r.class_code, r.id]));

  const { rows: userRows } =
    parentEmails.length > 0
      ? await db.query<UserEmailRoleRow>(
          `SELECT u.id, u.email, u.school_id, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ANY($1)`,
          [parentEmails]
        )
      : { rows: [] as UserEmailRoleRow[] };
  const userByEmail = new Map<string, UserEmailRoleRow>(userRows.map(r => [r.email, r]));

  const results: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const row = rows[i] || {};

    const missing: string[] = [];
    if (!isNonEmpty(row.student_first_name)) missing.push("student_first_name");
    if (!isNonEmpty(row.student_surname)) missing.push("student_surname");
    if (!isNonEmpty(row.student_gender)) missing.push("student_gender");
    if (!isNonEmpty(row.student_date_of_birth)) missing.push("student_date_of_birth");
    if (!isNonEmpty(row.class_code)) missing.push("class_code");
    if (!isNonEmpty(row.parent_first_name)) missing.push("parent_first_name");
    if (!isNonEmpty(row.parent_surname)) missing.push("parent_surname");
    if (!isNonEmpty(row.parent_relationship_to_student)) missing.push("parent_relationship_to_student");
    if (!isNonEmpty(row.parent_contact_number)) missing.push("parent_contact_number");
    if (!isNonEmpty(row.parent_email)) missing.push("parent_email");

    if (missing.length > 0) {
      results.push({ row: rowNum, status: "error", message: `Missing required field(s): ${missing.join(", ")}` });
      continue;
    }

    const parentEmail = String(row.parent_email).trim();

    const classId = classIdByCode.get(String(row.class_code).trim());
    if (!classId) {
      results.push({ row: rowNum, status: "error", message: `Invalid class code: ${row.class_code}` });
      continue;
    }

    const existingUser = userByEmail.get(parentEmail);

    if (existingUser && existingUser.role_name !== "parent") {
      results.push({ row: rowNum, status: "error", message: `${parentEmail} belongs to a non-parent account` });
      continue;
    }

    // Emails are globally unique (see users.email's UNIQUE constraint), but
    // a match here must still only be reused as "the same parent, another
    // guardian link" within this school. Without this check, an email that
    // happens to belong to a different school's parent would silently
    // attach that stranger as an approved guardian of this school's
    // student — a cross-tenant data leak, not just a false-positive match.
    if (existingUser && existingUser.school_id !== schoolId) {
      results.push({ row: rowNum, status: "error", message: `${parentEmail} belongs to an account in a different school` });
      continue;
    }

    try {
      await db.query("BEGIN");

      let parentId: number;
      let parentCreated = false;
      let temporaryPassword: string | undefined;

      if (existingUser) {
        const { rows: parentRows } = await db.query<IdRow>("SELECT id FROM parents WHERE user_id = $1", [existingUser.id]);
        const existingParent = parentRows[0];
        if (!existingParent) {
          throw new Error(`${parentEmail} is a parent-role account with no parent profile`);
        }
        parentId = existingParent.id;
      } else {
        temporaryPassword = generateTemporaryPassword();
        // Cost 8, not the usual 10: this runs synchronously in the Worker's
        // request path, once per new parent in the batch (plus another
        // per-row hash in createStudentLogin below when student logins are
        // provisioned) — up to MAX_BULK_UPLOAD_ROWS x 2 sequential hashes.
        // At cost 10 (~50ms/hash) a full batch alone can exceed the Worker's
        // CPU-time limit; cost 8 (~12ms/hash) keeps a full batch's worth
        // comfortably under it. Safe to lower here specifically because
        // this is a machine-generated, one-time password forced to reset on
        // first login, not a user-chosen one — see generateTemporaryPassword.
        const passwordHash = await bcrypt.hash(temporaryPassword, 8);

        const {
          rows: [userResult]
        } = await db.query<IdRow>(
          `INSERT INTO users (username, email, password_hash, role_id, school_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [`${row.parent_first_name} ${row.parent_surname}`, parentEmail, passwordHash, parentRoleId, schoolId]
        );
        const newUserId = userResult.id;

        const {
          rows: [parentResult]
        } = await db.query<IdRow>(
          `INSERT INTO parents (
             user_id, school_id, first_name, middle_name, surname, relationship_to_student,
             date_of_birth, address1, address2, address3, city, postcode, medical_condition,
             contact_number, email
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
          [
            newUserId,
            schoolId,
            row.parent_first_name,
            row.parent_middle_name || null,
            row.parent_surname,
            row.parent_relationship_to_student,
            row.parent_date_of_birth || null,
            row.parent_address1 || null,
            row.parent_address2 || null,
            row.parent_address3 || null,
            row.parent_city || null,
            row.parent_postcode || null,
            row.parent_medical_condition || null,
            row.parent_contact_number,
            parentEmail
          ]
        );
        parentId = parentResult.id;
        parentCreated = true;
      }

      const guardianCode = await generateUniqueGuardianCode(db, schoolId!);
      const {
        rows: [studentResult]
      } = await db.query<IdRow>(
        `INSERT INTO students (
           school_id, first_name, middle_name, surname, gender, date_of_birth,
           address1, address2, address3, city, postcode, medical_condition, guardian_code
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          schoolId,
          row.student_first_name,
          row.student_middle_name || null,
          row.student_surname,
          row.student_gender,
          row.student_date_of_birth,
          row.student_address1 || null,
          row.student_address2 || null,
          row.student_address3 || null,
          row.student_city || null,
          row.student_postcode || null,
          row.student_medical_condition || null,
          guardianCode
        ]
      );
      const studentId = studentResult.id;

      await db.query(
        "INSERT INTO student_guardians (student_id, parent_id, status, approved_at) VALUES ($1, $2, 'approved', CURRENT_TIMESTAMP)",
        [studentId, parentId]
      );
      await db.query("INSERT INTO student_classes (student_id, class_id) VALUES ($1, $2)", [studentId, classId]);

      let studentUsername: string | undefined;
      let studentTemporaryPassword: string | undefined;
      if (provisionStudentLogins && studentRoleId) {
        const studentLogin = await createStudentLogin(db, {
          studentId,
          firstName: row.student_first_name,
          surname: row.student_surname,
          schoolId: schoolId!,
          studentRoleId
        });
        studentUsername = studentLogin.username;
        studentTemporaryPassword = studentLogin.temporaryPassword;
      }

      await db.query("COMMIT");
      results.push({
        row: rowNum,
        status: "created",
        studentId,
        parentCreated,
        temporaryPassword,
        studentUsername,
        studentTemporaryPassword
      });
    } catch (err: any) {
      await db.query("ROLLBACK");
      logger.error({ err, row: rowNum }, "Bulk student upload row error");
      const message =
        err?.code === "23505" ? "Duplicate entry (this email or address already exists)" : "Failed to create this row";
      results.push({ row: rowNum, status: "error", message });
    }
  }

  const succeeded = results.filter(r => r.status === "created").length;
  return c.json({
    summary: { total: rows.length, succeeded, failed: rows.length - succeeded },
    results
  });
});

export default router;
