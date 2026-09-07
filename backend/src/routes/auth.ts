import { Hono } from "hono";
import type { AppEnv } from "../types/env";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import bcrypt from "bcryptjs";
import type { JwtPayload, RoleName } from "../types/auth";
import { authMiddleware } from "../middleware/auth";
import { signToken, cookieOptions, COOKIE_NAME } from "../utils/token";
import { generateUniqueGuardianCode } from "../utils/guardianCode";
import { isFeatureEnabled } from "../utils/featureFlags";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { requireEnv, isCookieSecure } from "../config/env";
import { checkRateLimit } from "../utils/rateLimit";

const router = new Hono<AppEnv>();

// Every `SELECT id FROM ...` existence/lookup query and every `RETURNING
// id` in this file resolves to this same single-column shape.
interface IdRow {
  id: number;
}

interface LoginUserRow {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  school_id: number | null;
  token_version: number;
  must_reset_password: boolean;
  role: string;
}

interface UserFullNameRow {
  first_name: string | null;
  surname: string | null;
}

interface PasswordAndTokenVersionRow {
  password_hash: string;
  token_version: number;
}

interface TokenVersionRow {
  token_version: number;
}

const isNonEmpty = (v?: string) => !!v && v.trim().length > 0;

// This is the real source of truth — Register.tsx has the same rule for
// fast client-side feedback (frontend/src/utils/password.ts), but the
// server enforces it regardless of what the client sends.
// Upper bound matches bcrypt's own 72-byte input limit (anything past that
// is silently ignored by bcrypt itself, so two different long passwords
// sharing the same first 72 bytes would hash identically) — also closes
// off submitting an arbitrarily large string into bcrypt.hash(), which is
// CPU-bound work billed per-request on Workers.
const isStrongPassword = (v?: string) =>
  !!v && v.length >= 8 && v.length <= 72 && /[A-Za-z]/.test(v) && /[0-9]/.test(v);

// Same reasoning as isStrongPassword above — Register.tsx's <input
// type="email"> gives the browser's own native format check, but that's
// only ever a UX nicety, not enforcement; a request built by hand skips
// it entirely. Deliberately not a full RFC 5322 validator (that ends up
// rejecting real addresses more often than it catches fake ones) — just
// enough to reject the "any non-empty string" case this was flagged for.
const isValidEmail = (v?: string) => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/* ============================================================
   DUPLICATE CHECK ENDPOINT
   Deliberately not centralized like the routes below: on failure this
   responds { exists: false } (fail open, so a DB hiccup here doesn't block
   registration) rather than the standard error shape — a genuinely
   different contract, not boilerplate.
   ============================================================ */
router.post("/check-duplicate", async c => {
  if (!(await checkRateLimit(c, { key: "registration", limit: 30, windowSeconds: 3600 }))) {
    return c.json({ message: "Too many requests. Please try again later." }, 429);
  }

  const db = c.get("db");
  try {
    const { email, address1, postcode } = await c.req.json();

    if (!email && !address1 && !postcode) {
      return c.json({ exists: false });
    }

    // EMAIL CHECK
    const { rows: emailRows } = await db.query<IdRow>(
      `
      SELECT id FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    if (emailRows.length > 0) {
      return c.json({ exists: true, reason: "email" });
    }

    // ADDRESS CHECK — users has no address columns; addresses live on
    // parents/staff_details, so check those instead.
    if (address1 && postcode) {
      const { rows: addressRows } = await db.query<IdRow>(
        `
        SELECT id FROM parents WHERE address1 = $1 AND postcode = $2
        UNION
        SELECT id FROM staff_details WHERE address1 = $3 AND postcode = $4
        LIMIT 1
        `,
        [address1, postcode, address1, postcode]
      );

      if (addressRows.length > 0) {
        return c.json({ exists: true, reason: "address" });
      }
    }

    return c.json({ exists: false });
  } catch (err) {
    logger.error({ err }, "Duplicate check error");
    return c.json({ exists: false }, 500);
  }
});

/* ============================================================
   PARENT REGISTRATION — ALWAYS PENDING APPROVAL
   ============================================================ */
router.post("/register-parent", async c => {
  if (!(await checkRateLimit(c, { key: "registration", limit: 30, windowSeconds: 3600 }))) {
    return c.json({ message: "Too many requests. Please try again later." }, 429);
  }

  const db = c.get("db");
  const { user_type, parent, students, guardian_links, school_code } = await c.req.json();
  const guardianLinks = Array.isArray(guardian_links) ? guardian_links : [];

  if (user_type !== "parent") {
    return c.json({ message: "Invalid user type for parent registration" }, 400);
  }

  if (!parent || !Array.isArray(students)) {
    return c.json({ message: "Missing parent or students data" }, 400);
  }

  if (students.length === 0 && guardianLinks.length === 0) {
    return c.json({ message: "At least one student or guardian code is required" }, 400);
  }

  if (!isNonEmpty(parent.first_name) || !isNonEmpty(parent.surname)) {
    return c.json({ message: "Parent name required" }, 400);
  }

  if (!isNonEmpty(parent.relationship_to_student)) {
    return c.json({ message: "Relationship to student required" }, 400);
  }

  if (!isNonEmpty(parent.email) || !isNonEmpty(parent.password)) {
    return c.json({ message: "Email and password required" }, 400);
  }

  if (!isValidEmail(parent.email)) {
    return c.json({ message: "Enter a valid email address" }, 400);
  }

  if (!isStrongPassword(parent.password)) {
    return c.json({ message: "Password must be at least 8 characters and include a letter and a number" }, 400);
  }

  if (!isNonEmpty(parent.contact_number)) {
    return c.json({ message: "Contact number required" }, 400);
  }

  if (!isNonEmpty(school_code)) {
    return c.json({ message: "School code required" }, 400);
  }

  for (const s of students) {
    if (!isNonEmpty(s.first_name) || !isNonEmpty(s.surname)) {
      return c.json({ message: "Each student must have first name and surname" }, 400);
    }
    if (!isNonEmpty(s.class_code)) {
      return c.json({ message: "Each student must have a class code" }, 400);
    }
  }

  for (const l of guardianLinks) {
    if (!isNonEmpty(l?.guardian_code)) {
      return c.json({ message: "Each guardian link requires a guardian code" }, 400);
    }
  }

  /* ---------------- SCHOOL / CLASS CODE RESOLUTION ---------------- */
  const { rows: schoolRows } = await db.query<IdRow>(`SELECT id FROM schools WHERE school_code = $1 LIMIT 1`, [
    school_code.trim()
  ]);
  const schoolId = schoolRows[0]?.id;
  if (!schoolId) {
    return c.json({ message: "Invalid school code" }, 400);
  }

  const classIdByCode = new Map<string, number>();
  for (const s of students) {
    const code = s.class_code.trim();
    if (classIdByCode.has(code)) continue;
    const { rows: classRows } = await db.query<IdRow>(`SELECT id FROM classes WHERE school_id = $1 AND class_code = $2 LIMIT 1`, [
      schoolId,
      code
    ]);
    const classId = classRows[0]?.id;
    if (!classId) {
      return c.json({ message: `Invalid class code: ${code}` }, 400);
    }
    classIdByCode.set(code, classId);
  }

  /* ---------------- GUARDIAN CODE RESOLUTION ---------------- */
  // Deduped by resolved student id, not raw code — two different codes
  // could theoretically resolve to the same student, and re-submitting
  // the same code twice must not attempt a duplicate insert later.
  const linkedStudentIds = new Set<number>();
  for (const l of guardianLinks) {
    const code = String(l.guardian_code).trim();
    const { rows: studentRows } = await db.query<IdRow>(
      `SELECT id FROM students WHERE school_id = $1 AND guardian_code = $2 LIMIT 1`,
      [schoolId, code]
    );
    const studentId = studentRows[0]?.id;
    if (!studentId) {
      return c.json({ message: `Invalid guardian code: ${code}` }, 400);
    }
    linkedStudentIds.add(studentId);
  }

  /* ---------------- DUPLICATE CHECK ---------------- */
  const { rows: emailRows } = await db.query<IdRow>(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [parent.email]);
  if (emailRows.length > 0) {
    return c.json({ message: "Email already exists" }, 409);
  }

  if (parent.address1 && parent.postcode) {
    const { rows: addressRows } = await db.query<IdRow>(
      `SELECT id FROM parents WHERE address1 = $1 AND postcode = $2
       UNION
       SELECT id FROM staff_details WHERE address1 = $3 AND postcode = $4
       LIMIT 1`,
      [parent.address1, parent.postcode, parent.address1, parent.postcode]
    );
    if (addressRows.length > 0) {
      return c.json({ message: "Address already registered" }, 409);
    }
  }

  // ALWAYS assign pending role
  const { rows: roleRows } = await db.query<IdRow>("SELECT id FROM roles WHERE name = 'pending'");
  const pendingRoleId = roleRows[0]?.id;

  if (!pendingRoleId) {
    return c.json({ message: "Pending role missing in DB" }, 500);
  }

  const passwordHash = await bcrypt.hash(parent.password, 10);

  // There's already exactly one connection for the whole request, so the
  // transaction runs directly on it rather than a separately checked-out
  // pool connection.
  try {
    await db.query("BEGIN");

    // Insert user with pending role + requested_role = parent
    // (users has no address columns — the address lives on the parents row below)
    const {
      rows: [userResult]
    } = await db.query<IdRow>(
      `INSERT INTO users (username, email, password_hash, role_id, school_id, requested_role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [`${parent.first_name} ${parent.surname}`, parent.email, passwordHash, pendingRoleId, schoolId, "parent"]
    );

    const userId = userResult.id;

    const {
      rows: [parentResult]
    } = await db.query<IdRow>(
      `INSERT INTO parents (
         user_id,
         school_id,
         first_name,
         middle_name,
         surname,
         relationship_to_student,
         date_of_birth,
         address1,
         address2,
         address3,
         city,
         postcode,
         medical_condition,
         contact_number,
         email
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
      [
        userId,
        schoolId,
        parent.first_name,
        parent.middle_name || null,
        parent.surname,
        parent.relationship_to_student,
        parent.date_of_birth || null,
        parent.address1 || null,
        parent.address2 || null,
        parent.address3 || null,
        parent.city || null,
        parent.postcode || null,
        parent.medical_condition || null,
        parent.contact_number,
        parent.email
      ]
    );

    const parentId = parentResult.id;

    for (const s of students) {
      const guardianCode = await generateUniqueGuardianCode(db, schoolId);
      const {
        rows: [studentResult]
      } = await db.query<IdRow>(
        `INSERT INTO students (
           school_id,
           first_name,
           middle_name,
           surname,
           gender,
           date_of_birth,
           address1,
           address2,
           address3,
           city,
           postcode,
           medical_condition,
           guardian_code
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          schoolId,
          s.first_name,
          s.middle_name || null,
          s.surname,
          s.gender || null,
          s.date_of_birth || null,
          s.address1 || null,
          s.address2 || null,
          s.address3 || null,
          s.city || null,
          s.postcode || null,
          s.medical_condition || null,
          guardianCode
        ]
      );

      const studentId = studentResult.id;
      // This registering parent is this brand-new student's first
      // guardian — approved immediately, same as today's single-guardian
      // behavior (the whole account is still gated by users.role='pending'
      // until an admin approves it, same as before).
      await db.query(
        "INSERT INTO student_guardians (student_id, parent_id, status, approved_at) VALUES ($1, $2, 'approved', CURRENT_TIMESTAMP)",
        [studentId, parentId]
      );

      const classId = classIdByCode.get(s.class_code.trim())!;
      await db.query(`INSERT INTO student_classes (student_id, class_id) VALUES ($1, $2)`, [studentId, classId]);
    }

    // Requests to link to an EXISTING child (not created by this
    // registration) always start 'pending' — the whole-user approval
    // above flips these to 'approved' at the same time, so a brand-new
    // registrant doesn't need a second, separate admin decision for it.
    for (const studentId of linkedStudentIds) {
      await db.query("INSERT INTO student_guardians (student_id, parent_id, status) VALUES ($1, $2, 'pending')", [
        studentId,
        parentId
      ]);
    }

    await db.query("COMMIT");
    return c.json({ message: "Parent registration submitted. Pending approval." }, 201);
  } catch (err: any) {
    await db.query("ROLLBACK");
    if (err?.code === "23505") {
      throw new HttpError(409, "An account with this email already exists");
    }
    throw err;
  }
});

/* ============================================================
   STAFF REGISTRATION — ALWAYS PENDING APPROVAL
   ============================================================ */
router.post("/register-staff", async c => {
  if (!(await checkRateLimit(c, { key: "registration", limit: 30, windowSeconds: 3600 }))) {
    return c.json({ message: "Too many requests. Please try again later." }, 429);
  }

  const db = c.get("db");
  const {
    user_type,
    first_name,
    middle_name,
    surname,
    gender,
    date_of_birth,
    address1,
    address2,
    address3,
    city,
    postcode,
    medical_condition,
    disability,
    email,
    phone_number,
    password,
    school_code
  } = await c.req.json();

  if (user_type !== "staff") {
    return c.json({ message: "Invalid user type for staff registration" }, 400);
  }

  if (!isNonEmpty(first_name) || !isNonEmpty(surname)) {
    return c.json({ message: "Staff name required" }, 400);
  }

  if (!isNonEmpty(gender)) {
    return c.json({ message: "Gender is required" }, 400);
  }

  if (!isNonEmpty(email) || !isNonEmpty(password)) {
    return c.json({ message: "Email and password required" }, 400);
  }

  if (!isValidEmail(email)) {
    return c.json({ message: "Enter a valid email address" }, 400);
  }

  if (!isStrongPassword(password)) {
    return c.json({ message: "Password must be at least 8 characters and include a letter and a number" }, 400);
  }

  if (!isNonEmpty(phone_number)) {
    return c.json({ message: "Phone number required" }, 400);
  }

  if (!isNonEmpty(school_code)) {
    return c.json({ message: "School code required" }, 400);
  }

  const { rows: schoolRows } = await db.query<IdRow>(`SELECT id FROM schools WHERE school_code = $1 LIMIT 1`, [
    school_code.trim()
  ]);
  const schoolId = schoolRows[0]?.id;
  if (!schoolId) {
    return c.json({ message: "Invalid school code" }, 400);
  }

  /* ---------------- DUPLICATE CHECK ---------------- */
  const { rows: emailRows } = await db.query<IdRow>(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]);
  if (emailRows.length > 0) {
    return c.json({ message: "Email already exists" }, 409);
  }

  if (address1 && postcode) {
    const { rows: addressRows } = await db.query<IdRow>(
      `SELECT id FROM parents WHERE address1 = $1 AND postcode = $2
       UNION
       SELECT id FROM staff_details WHERE address1 = $3 AND postcode = $4
       LIMIT 1`,
      [address1, postcode, address1, postcode]
    );
    if (addressRows.length > 0) {
      return c.json({ message: "Address already registered" }, 409);
    }
  }

  // ALWAYS assign pending role
  const { rows: roleRows } = await db.query<IdRow>("SELECT id FROM roles WHERE name = 'pending'");
  const pendingRoleId = roleRows[0]?.id;

  if (!pendingRoleId) {
    return c.json({ message: "Pending role missing in DB" }, 500);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await db.query("BEGIN");

    // Insert user with pending role + requested_role = staff
    // (users has no address columns — the address lives on staff_details below)
    const {
      rows: [userResult]
    } = await db.query<IdRow>(
      `INSERT INTO users (username, email, password_hash, role_id, school_id, requested_role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [`${first_name} ${surname}`, email, passwordHash, pendingRoleId, schoolId, "staff"]
    );

    const userId = userResult.id;

    await db.query(
      `INSERT INTO staff_details (
         user_id,
         school_id,
         first_name,
         middle_name,
         surname,
         gender,
         date_of_birth,
         address1,
         address2,
         address3,
         city,
         postcode,
         medical_condition,
         disability,
         email,
         phone_number
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        userId,
        schoolId,
        first_name,
        middle_name || null,
        surname,
        gender,
        date_of_birth || null,
        address1 || null,
        address2 || null,
        address3 || null,
        city || null,
        postcode || null,
        medical_condition || null,
        disability || null,
        email,
        phone_number
      ]
    );

    await db.query("COMMIT");
    return c.json({ message: "Staff registration submitted. Pending approval." }, 201);
  } catch (err: any) {
    await db.query("ROLLBACK");
    if (err?.code === "23505") {
      throw new HttpError(409, "An account with this email already exists");
    }
    throw err;
  }
});

/* ============================================================
   LOGIN / LOGOUT / ME
   Login also gets the single free Cloudflare native Rate Limiting Rule
   (edge-blocked, zero app code) as the primary defense, since it's the
   tightest, highest-value brute-force target — but that rule lives in the
   Cloudflare dashboard, not this repo, so it isn't covered by tests and
   could simply be missing in some environment (a fresh account, a preview
   deploy, a misconfigured dashboard). The checkRateLimit call below is a
   real fallback, not just a formality: same KV-approximate limiter used
   for registration/change-password, same threshold the old Express
   loginLimiter used before the Cloudflare migration.
   ============================================================ */

router.post("/login", async c => {
  if (!(await checkRateLimit(c, { key: "login", limit: 10, windowSeconds: 900 }))) {
    return c.json({ message: "Too many login attempts. Please try again later." }, 429);
  }

  const db = c.get("db");
  const { username, password } = await c.req.json();

  if (!isNonEmpty(username) || !isNonEmpty(password)) {
    return c.json({ message: "Username/email and password required" }, 400);
  }

  const { rows } = await db.query<LoginUserRow>(
    `SELECT u.id, u.username, u.email, u.password_hash, u.school_id, u.token_version, u.must_reset_password, r.name as role
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.username = $1 OR u.email = $2`,
    [username, username]
  );

  const user = rows[0];
  if (!user) return c.json({ message: "Invalid credentials" }, 401);

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return c.json({ message: "Invalid credentials" }, 401);

  const jwtSecret = requireEnv(c, "JWT_SECRET");
  const token = await signToken(jwtSecret, {
    userId: user.id,
    username: user.username,
    // r.name comes from role_id's FK into roles, which only ever contains the
    // seeded RoleName values — safe to narrow.
    role: user.role as RoleName,
    schoolId: user.school_id,
    tokenVersion: user.token_version,
    sessionStartedAt: Math.floor(Date.now() / 1000),
    mustResetPassword: !!user.must_reset_password
  });

  setCookie(c, COOKIE_NAME, token, cookieOptions(isCookieSecure(c)));

  return c.json({ message: "Logged in", role: user.role });
});

router.post("/logout", async c => {
  const db = c.get("db");
  const token = getCookie(c, COOKIE_NAME);
  if (token) {
    try {
      const jwtSecret = requireEnv(c, "JWT_SECRET");
      const decoded = (await verify(token, jwtSecret, "HS256")) as unknown as JwtPayload;
      // Bumping token_version invalidates every token issued for this user,
      // not just the one in this cookie — there's no per-device/session
      // tracking, so "log out" means "log out everywhere," which is the
      // safer default for a shared/public-computer context like a school.
      await db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [decoded.userId]);
    } catch (err) {
      // Already-expired/invalid token — nothing to revoke server-side, but
      // logout should still succeed and clear the cookie either way.
      logger.warn({ err }, "Logout: could not revoke token version");
    }
  }
  deleteCookie(c, COOKIE_NAME, cookieOptions(isCookieSecure(c)));
  return c.json({ message: "Logged out" });
});

router.get("/me", authMiddleware, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  // Deliberately not centralized: a failure here falls back to returning
  // the user without fullName rather than erroring the whole request —
  // the caller is already authenticated, so this shouldn't fail their
  // session over a display-name lookup.
  try {
    const { rows } = await db.query<UserFullNameRow>(
      `SELECT
         COALESCE(sd.first_name, p.first_name) AS first_name,
         COALESCE(sd.surname, p.surname) AS surname
       FROM users u
       LEFT JOIN staff_details sd ON sd.user_id = u.id
       LEFT JOIN parents p ON p.user_id = u.id
       WHERE u.id = $1`,
      [user.userId]
    );

    const details = rows[0] || { first_name: null, surname: null };
    const fullName = [details.first_name, details.surname].filter(Boolean).join(" ");

    return c.json({
      user: {
        ...user,
        fullName: fullName || null
      }
    });
  } catch (err) {
    logger.error({ err }, "Error loading user details");
    return c.json({ user });
  }
});

/* ============================================================
   CHANGE PASSWORD — SELF-SERVICE, ANY ROLE
   Behind the "password_management" flag, except system_admin (schoolId
   is null, and they administer the flag itself — same bypass pattern
   admin.ts uses for platform-wide callers).
   ============================================================ */
router.post("/change-password", authMiddleware, async c => {
  if (!(await checkRateLimit(c, { key: "change-password", limit: 10, windowSeconds: 900 }))) {
    return c.json({ message: "Too many attempts. Please try again later." }, 429);
  }

  const db = c.get("db");
  const user = c.get("user")!;

  if (user.role !== "system_admin") {
    if (!(await isFeatureEnabled(db, "password_management", user.schoolId))) {
      return c.json({ message: "Password management is currently disabled for this school" }, 403);
    }
  }

  const { current_password, new_password } = await c.req.json();
  if (!isNonEmpty(current_password) || !isNonEmpty(new_password)) {
    return c.json({ message: "Current and new password are required" }, 400);
  }

  const { rows } = await db.query<PasswordAndTokenVersionRow>("SELECT password_hash, token_version FROM users WHERE id = $1", [user.userId]);
  const dbUser = rows[0];
  if (!dbUser) return c.json({ message: "User not found" }, 404);

  const match = await bcrypt.compare(current_password, dbUser.password_hash);
  if (!match) return c.json({ message: "Current password is incorrect" }, 401);

  if (!isStrongPassword(new_password)) {
    return c.json({ message: "New password must be at least 8 characters and include a letter and a number" }, 400);
  }

  const newHash = await bcrypt.hash(new_password, 10);
  const newTokenVersion = dbUser.token_version + 1;

  // Bumping token_version logs out every other session using the old
  // password (same as a manual logout) — but this request's own session
  // must keep working, so a fresh cookie is issued immediately below
  // rather than leaving the caller logged out by their own action.
  await db.query("UPDATE users SET password_hash = $1, token_version = $2 WHERE id = $3", [
    newHash,
    newTokenVersion,
    user.userId
  ]);

  const jwtSecret = requireEnv(c, "JWT_SECRET");
  const token = await signToken(jwtSecret, {
    userId: user.userId,
    username: user.username,
    role: user.role,
    schoolId: user.schoolId,
    tokenVersion: newTokenVersion,
    sessionStartedAt: user.sessionStartedAt,
    mustResetPassword: user.mustResetPassword
  });
  setCookie(c, COOKIE_NAME, token, cookieOptions(isCookieSecure(c)));

  return c.json({ message: "Password changed" });
});

/* ============================================================
   COMPLETE A FORCED PASSWORD RESET
   The one route reachable (alongside /me and /logout, see authMiddleware's
   allowlist) while must_reset_password is blocking everything else. No
   current_password is asked for — the caller already proved they hold it by
   logging in with it, and that temp password is meant to be single-use, not
   re-verified a second time here. Deliberately NOT gated by the
   password_management flag like /change-password is: this is the one way
   out of the forced-reset state, and blocking it on a flag that could be
   toggled off after the reset already happened would strand the user with
   no escape route.
   ============================================================ */
router.post("/force-password-reset", authMiddleware, async c => {
  if (!(await checkRateLimit(c, { key: "change-password", limit: 10, windowSeconds: 900 }))) {
    return c.json({ message: "Too many attempts. Please try again later." }, 429);
  }

  const db = c.get("db");
  const user = c.get("user")!;

  if (!user.mustResetPassword) {
    return c.json({ message: "No password reset is pending for this account" }, 400);
  }

  const { new_password } = await c.req.json();
  if (!isStrongPassword(new_password)) {
    return c.json({ message: "New password must be at least 8 characters and include a letter and a number" }, 400);
  }

  const { rows } = await db.query<TokenVersionRow>("SELECT token_version FROM users WHERE id = $1", [user.userId]);
  const dbUser = rows[0];
  if (!dbUser) return c.json({ message: "User not found" }, 404);

  const newHash = await bcrypt.hash(new_password, 10);
  const newTokenVersion = dbUser.token_version + 1;

  await db.query("UPDATE users SET password_hash = $1, must_reset_password = FALSE, token_version = $2 WHERE id = $3", [
    newHash,
    newTokenVersion,
    user.userId
  ]);

  const jwtSecret = requireEnv(c, "JWT_SECRET");
  const token = await signToken(jwtSecret, {
    userId: user.userId,
    username: user.username,
    role: user.role,
    schoolId: user.schoolId,
    tokenVersion: newTokenVersion,
    sessionStartedAt: user.sessionStartedAt,
    mustResetPassword: false
  });
  setCookie(c, COOKIE_NAME, token, cookieOptions(isCookieSecure(c)));

  return c.json({ message: "Password updated" });
});

export default router;
