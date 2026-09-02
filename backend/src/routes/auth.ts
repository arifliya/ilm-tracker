import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../config/db";
import { logger } from "../utils/logger";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthenticatedRequest, JwtPayload } from "../types/auth";
import { authMiddleware } from "../middleware/auth";
import { signToken, COOKIE_OPTIONS } from "../utils/token";
import { generateUniqueGuardianCode } from "../utils/guardianCode";
import { isFeatureEnabled } from "../utils/featureFlags";
import { asyncHandler } from "../utils/asyncHandler";
import { HttpError } from "../utils/httpError";

const router = Router();

const isNonEmpty = (v?: string) => !!v && v.trim().length > 0;

// This is the real source of truth — Register.tsx has the same rule for
// fast client-side feedback (frontend/src/utils/password.ts), but the
// server enforces it regardless of what the client sends.
const isStrongPassword = (v?: string) =>
  !!v && v.length >= 8 && /[A-Za-z]/.test(v) && /[0-9]/.test(v);

// Skip entirely under Jest (NODE_ENV=test is set automatically by the
// test runner) — a supertest run fires far more requests at these routes
// per test file than any real client would in the same window, and the
// point of these limiters is protecting production traffic, not shaping
// test behavior.
const isTestEnv = () => env.NODE_ENV === "test";

// Brute-force protection: a handful of wrong-password guesses is normal
// (typos), but double digits from one IP in 15 minutes is credential
// stuffing, not a person.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: { message: "Too many login attempts. Please try again later." }
});

// Looser limit for registration/duplicate-check — enough headroom for a
// real family registering multiple children in one sitting, but still a
// backstop against scripted signup spam or email-enumeration via
// check-duplicate.
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: { message: "Too many requests. Please try again later." }
});

// Same shape as loginLimiter — change-password requires current_password,
// so it's just as much a password-guessing target as /login, this time
// against a live session rather than a username.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
  message: { message: "Too many attempts. Please try again later." }
});

/* ============================================================
   DUPLICATE CHECK ENDPOINT
   Deliberately not centralized like the routes below: on failure this
   responds { exists: false } (fail open, so a DB hiccup here doesn't block
   registration) rather than the standard error shape — a genuinely
   different contract, not boilerplate.
   ============================================================ */
router.post("/check-duplicate", registrationLimiter, async (req, res) => {
  try {
    const { email, address1, postcode } = req.body;

    if (!email && !address1 && !postcode) {
      return res.json({ exists: false });
    }

    // EMAIL CHECK
    const [emailRows] = await pool.query(
      `
      SELECT id FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if ((emailRows as any).length > 0) {
      return res.json({ exists: true, reason: "email" });
    }

    // ADDRESS CHECK — users has no address columns; addresses live on
    // parents/staff_details, so check those instead.
    if (address1 && postcode) {
      const [addressRows] = await pool.query(
        `
        SELECT id FROM parents WHERE address1 = ? AND postcode = ?
        UNION
        SELECT id FROM staff_details WHERE address1 = ? AND postcode = ?
        LIMIT 1
        `,
        [address1, postcode, address1, postcode]
      );

      if ((addressRows as any).length > 0) {
        return res.json({ exists: true, reason: "address" });
      }
    }

    return res.json({ exists: false });
  } catch (err) {
    logger.error({ err }, "Duplicate check error");
    return res.status(500).json({ exists: false });
  }
});

/* ============================================================
   PARENT REGISTRATION — ALWAYS PENDING APPROVAL
   ============================================================ */
router.post(
  "/register-parent",
  registrationLimiter,
  asyncHandler(async (req, res) => {
    const { user_type, parent, students, guardian_links, school_code } = req.body;
    const guardianLinks = Array.isArray(guardian_links) ? guardian_links : [];

    if (user_type !== "parent") {
      return res.status(400).json({ message: "Invalid user type for parent registration" });
    }

    if (!parent || !Array.isArray(students)) {
      return res.status(400).json({ message: "Missing parent or students data" });
    }

    if (students.length === 0 && guardianLinks.length === 0) {
      return res.status(400).json({ message: "At least one student or guardian code is required" });
    }

    if (!isNonEmpty(parent.first_name) || !isNonEmpty(parent.surname)) {
      return res.status(400).json({ message: "Parent name required" });
    }

    if (!isNonEmpty(parent.relationship_to_student)) {
      return res.status(400).json({ message: "Relationship to student required" });
    }

    if (!isNonEmpty(parent.email) || !isNonEmpty(parent.password)) {
      return res.status(400).json({ message: "Email and password required" });
    }

    if (!isStrongPassword(parent.password)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include a letter and a number"
      });
    }

    if (!isNonEmpty(parent.contact_number)) {
      return res.status(400).json({ message: "Contact number required" });
    }

    if (!isNonEmpty(school_code)) {
      return res.status(400).json({ message: "School code required" });
    }

    for (const s of students) {
      if (!isNonEmpty(s.first_name) || !isNonEmpty(s.surname)) {
        return res.status(400).json({ message: "Each student must have first name and surname" });
      }
      if (!isNonEmpty(s.class_code)) {
        return res.status(400).json({ message: "Each student must have a class code" });
      }
    }

    for (const l of guardianLinks) {
      if (!isNonEmpty(l?.guardian_code)) {
        return res.status(400).json({ message: "Each guardian link requires a guardian code" });
      }
    }

    /* ---------------- SCHOOL / CLASS CODE RESOLUTION ---------------- */
    const [schoolRows] = await pool.query(
      `SELECT id FROM schools WHERE school_code = ? LIMIT 1`,
      [school_code.trim()]
    );
    const schoolId = (schoolRows as any)[0]?.id;
    if (!schoolId) {
      return res.status(400).json({ message: "Invalid school code" });
    }

    const classIdByCode = new Map<string, number>();
    for (const s of students) {
      const code = s.class_code.trim();
      if (classIdByCode.has(code)) continue;
      const [classRows] = await pool.query(
        `SELECT id FROM classes WHERE school_id = ? AND class_code = ? LIMIT 1`,
        [schoolId, code]
      );
      const classId = (classRows as any)[0]?.id;
      if (!classId) {
        return res.status(400).json({ message: `Invalid class code: ${code}` });
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
      const [studentRows] = await pool.query(
        `SELECT id FROM students WHERE school_id = ? AND guardian_code = ? LIMIT 1`,
        [schoolId, code]
      );
      const studentId = (studentRows as any)[0]?.id;
      if (!studentId) {
        return res.status(400).json({ message: `Invalid guardian code: ${code}` });
      }
      linkedStudentIds.add(studentId);
    }

    /* ---------------- DUPLICATE CHECK ---------------- */
    const [emailRows] = await pool.query(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [parent.email]
    );
    if ((emailRows as any).length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    if (parent.address1 && parent.postcode) {
      const [addressRows] = await pool.query(
        `SELECT id FROM parents WHERE address1 = ? AND postcode = ?
         UNION
         SELECT id FROM staff_details WHERE address1 = ? AND postcode = ?
         LIMIT 1`,
        [parent.address1, parent.postcode, parent.address1, parent.postcode]
      );
      if ((addressRows as any).length > 0) {
        return res.status(409).json({ message: "Address already registered" });
      }
    }

    // ALWAYS assign pending role
    const [roleRows] = await pool.query(
      "SELECT id FROM roles WHERE name = 'pending'"
    );
    const pendingRoleId = (roleRows as any)[0]?.id;

    if (!pendingRoleId) {
      return res.status(500).json({ message: "Pending role missing in DB" });
    }

    const passwordHash = await bcrypt.hash(parent.password, 10);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Insert user with pending role + requested_role = parent
      // (users has no address columns — the address lives on the parents row below)
      const [userResult] = await conn.query(
        `INSERT INTO users (username, email, password_hash, role_id, school_id, requested_role)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          `${parent.first_name} ${parent.surname}`,
          parent.email,
          passwordHash,
          pendingRoleId,
          schoolId,
          "parent"
        ]
      );

      const userId = (userResult as any).insertId;

      const [parentResult] = await conn.query(
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

      const parentId = (parentResult as any).insertId;

      for (const s of students) {
        const guardianCode = await generateUniqueGuardianCode(conn, schoolId);
        const [studentResult] = await conn.query(
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
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

        const studentId = (studentResult as any).insertId;
        // This registering parent is this brand-new student's first
        // guardian — approved immediately, same as today's single-guardian
        // behavior (the whole account is still gated by users.role='pending'
        // until an admin approves it, same as before).
        await conn.query(
          "INSERT INTO student_guardians (student_id, parent_id, status, approved_at) VALUES (?, ?, 'approved', CURRENT_TIMESTAMP)",
          [studentId, parentId]
        );

        const classId = classIdByCode.get(s.class_code.trim())!;
        await conn.query(
          `INSERT INTO student_classes (student_id, class_id) VALUES (?, ?)`,
          [studentId, classId]
        );
      }

      // Requests to link to an EXISTING child (not created by this
      // registration) always start 'pending' — the whole-user approval
      // above flips these to 'approved' at the same time, so a brand-new
      // registrant doesn't need a second, separate admin decision for it.
      for (const studentId of linkedStudentIds) {
        await conn.query(
          "INSERT INTO student_guardians (student_id, parent_id, status) VALUES (?, ?, 'pending')",
          [studentId, parentId]
        );
      }

      await conn.commit();
      res.status(201).json({ message: "Parent registration submitted. Pending approval." });
    } catch (err: any) {
      await conn.rollback();
      if (err?.code === "ER_DUP_ENTRY") {
        throw new HttpError(409, "An account with this email already exists");
      }
      throw err;
    } finally {
      conn.release();
    }
  })
);

/* ============================================================
   STAFF REGISTRATION — ALWAYS PENDING APPROVAL
   ============================================================ */
router.post(
  "/register-staff",
  registrationLimiter,
  asyncHandler(async (req, res) => {
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
    } = req.body;

    if (user_type !== "staff") {
      return res.status(400).json({ message: "Invalid user type for staff registration" });
    }

    if (!isNonEmpty(first_name) || !isNonEmpty(surname)) {
      return res.status(400).json({ message: "Staff name required" });
    }

    if (!isNonEmpty(gender)) {
      return res.status(400).json({ message: "Gender is required" });
    }

    if (!isNonEmpty(email) || !isNonEmpty(password)) {
      return res.status(400).json({ message: "Email and password required" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include a letter and a number"
      });
    }

    if (!isNonEmpty(phone_number)) {
      return res.status(400).json({ message: "Phone number required" });
    }

    if (!isNonEmpty(school_code)) {
      return res.status(400).json({ message: "School code required" });
    }

    const [schoolRows] = await pool.query(
      `SELECT id FROM schools WHERE school_code = ? LIMIT 1`,
      [school_code.trim()]
    );
    const schoolId = (schoolRows as any)[0]?.id;
    if (!schoolId) {
      return res.status(400).json({ message: "Invalid school code" });
    }

    /* ---------------- DUPLICATE CHECK ---------------- */
    const [emailRows] = await pool.query(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    if ((emailRows as any).length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    if (address1 && postcode) {
      const [addressRows] = await pool.query(
        `SELECT id FROM parents WHERE address1 = ? AND postcode = ?
         UNION
         SELECT id FROM staff_details WHERE address1 = ? AND postcode = ?
         LIMIT 1`,
        [address1, postcode, address1, postcode]
      );
      if ((addressRows as any).length > 0) {
        return res.status(409).json({ message: "Address already registered" });
      }
    }

    // ALWAYS assign pending role
    const [roleRows] = await pool.query(
      "SELECT id FROM roles WHERE name = 'pending'"
    );
    const pendingRoleId = (roleRows as any)[0]?.id;

    if (!pendingRoleId) {
      return res.status(500).json({ message: "Pending role missing in DB" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Insert user with pending role + requested_role = staff
      // (users has no address columns — the address lives on staff_details below)
      const [userResult] = await conn.query(
        `INSERT INTO users (username, email, password_hash, role_id, school_id, requested_role)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          `${first_name} ${surname}`,
          email,
          passwordHash,
          pendingRoleId,
          schoolId,
          "staff"
        ]
      );

      const userId = (userResult as any).insertId;

      await conn.query(
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

      await conn.commit();
      res.status(201).json({ message: "Staff registration submitted. Pending approval." });
    } catch (err: any) {
      await conn.rollback();
      if (err?.code === "ER_DUP_ENTRY") {
        throw new HttpError(409, "An account with this email already exists");
      }
      throw err;
    } finally {
      conn.release();
    }
  })
);

/* ============================================================
   LOGIN / LOGOUT / ME
   ============================================================ */

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!isNonEmpty(username) || !isNonEmpty(password)) {
      return res.status(400).json({ message: "Username/email and password required" });
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.email, u.password_hash, u.school_id, u.token_version, u.must_reset_password, r.name as role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.username = ? OR u.email = ?`,
      [username, username]
    );

    const user = (rows as any)[0];
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      schoolId: user.school_id,
      tokenVersion: user.token_version,
      sessionStartedAt: Math.floor(Date.now() / 1000),
      mustResetPassword: !!user.must_reset_password
    });

    res.cookie("token", token, COOKIE_OPTIONS);

    res.json({ message: "Logged in", role: user.role });
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
        // Bumping token_version invalidates every token issued for this user,
        // not just the one in this cookie — there's no per-device/session
        // tracking, so "log out" means "log out everywhere," which is the
        // safer default for a shared/public-computer context like a school.
        await pool.query("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [decoded.userId]);
      } catch (err) {
        // Already-expired/invalid token — nothing to revoke server-side, but
        // logout should still succeed and clear the cookie either way.
        logger.warn({ err }, "Logout: could not revoke token version");
      }
    }
    res.clearCookie("token", COOKIE_OPTIONS);
    res.json({ message: "Logged out" });
  })
);

router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    // Deliberately not centralized: a failure here falls back to returning
    // req.user without fullName rather than erroring the whole request —
    // the caller is already authenticated, so this shouldn't fail their
    // session over a display-name lookup.
    try {
      const [rows] = await pool.query(
        `SELECT
           COALESCE(sd.first_name, p.first_name) AS first_name,
           COALESCE(sd.surname, p.surname) AS surname
         FROM users u
         LEFT JOIN staff_details sd ON sd.user_id = u.id
         LEFT JOIN parents p ON p.user_id = u.id
         WHERE u.id = ?`,
        [req.user!.userId]
      );

      const details = (rows as any[])[0] || {};
      const fullName = [details.first_name, details.surname]
        .filter(Boolean)
        .join(" ");

      res.json({
        user: {
          ...req.user,
          fullName: fullName || null
        }
      });
    } catch (err) {
      logger.error({ err }, "Error loading user details");
      res.json({ user: req.user });
    }
  })
);

/* ============================================================
   CHANGE PASSWORD — SELF-SERVICE, ANY ROLE
   Behind the "password_management" flag, except system_admin (schoolId
   is null, and they administer the flag itself — same bypass pattern
   admin.ts uses for platform-wide callers).
   ============================================================ */
router.post(
  "/change-password",
  authMiddleware,
  changePasswordLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (req.user!.role !== "system_admin") {
      if (!(await isFeatureEnabled("password_management", req.user!.schoolId))) {
        return res.status(403).json({ message: "Password management is currently disabled for this school" });
      }
    }

    const { current_password, new_password } = req.body;
    if (!isNonEmpty(current_password) || !isNonEmpty(new_password)) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    const [rows] = await pool.query(
      "SELECT password_hash, token_version FROM users WHERE id = ?",
      [req.user!.userId]
    );
    const user = (rows as any[])[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Current password is incorrect" });

    if (!isStrongPassword(new_password)) {
      return res.status(400).json({ message: "New password must be at least 8 characters and include a letter and a number" });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    const newTokenVersion = user.token_version + 1;

    // Bumping token_version logs out every other session using the old
    // password (same as a manual logout) — but this request's own session
    // must keep working, so a fresh cookie is issued immediately below
    // rather than leaving the caller logged out by their own action.
    await pool.query(
      "UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?",
      [newHash, newTokenVersion, req.user!.userId]
    );

    const token = signToken({
      userId: req.user!.userId,
      username: req.user!.username,
      role: req.user!.role,
      schoolId: req.user!.schoolId,
      tokenVersion: newTokenVersion,
      sessionStartedAt: req.user!.sessionStartedAt,
      mustResetPassword: req.user!.mustResetPassword
    });
    res.cookie("token", token, COOKIE_OPTIONS);

    res.json({ message: "Password changed" });
  })
);

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
router.post(
  "/force-password-reset",
  authMiddleware,
  changePasswordLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user!.mustResetPassword) {
      return res.status(400).json({ message: "No password reset is pending for this account" });
    }

    const { new_password } = req.body;
    if (!isStrongPassword(new_password)) {
      return res.status(400).json({
        message: "New password must be at least 8 characters and include a letter and a number"
      });
    }

    const [rows] = await pool.query("SELECT token_version FROM users WHERE id = ?", [req.user!.userId]);
    const user = (rows as any[])[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    const newHash = await bcrypt.hash(new_password, 10);
    const newTokenVersion = user.token_version + 1;

    await pool.query(
      "UPDATE users SET password_hash = ?, must_reset_password = FALSE, token_version = ? WHERE id = ?",
      [newHash, newTokenVersion, req.user!.userId]
    );

    const token = signToken({
      userId: req.user!.userId,
      username: req.user!.username,
      role: req.user!.role,
      schoolId: req.user!.schoolId,
      tokenVersion: newTokenVersion,
      sessionStartedAt: req.user!.sessionStartedAt,
      mustResetPassword: false
    });
    res.cookie("token", token, COOKIE_OPTIONS);

    res.json({ message: "Password updated" });
  })
);

export default router;
