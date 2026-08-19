import { Router } from "express";
import { pool } from "../config/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthenticatedRequest } from "../types/auth";
import { authMiddleware } from "../middleware/auth";

const router = Router();

const isNonEmpty = (v?: string) => !!v && v.trim().length > 0;

/* ============================================================
   DUPLICATE CHECK ENDPOINT
   ============================================================ */
router.post("/check-duplicate", async (req, res) => {
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
    console.error("Duplicate check error:", err);
    return res.status(500).json({ exists: false });
  }
});

/* ============================================================
   PARENT REGISTRATION — ALWAYS PENDING APPROVAL
   ============================================================ */
router.post("/register-parent", async (req, res) => {
  try {
    const { user_type, parent, students, school_code } = req.body;

    if (user_type !== "parent") {
      return res.status(400).json({ message: "Invalid user type for parent registration" });
    }

    if (!parent || !Array.isArray(students)) {
      return res.status(400).json({ message: "Missing parent or students data" });
    }

    if (students.length === 0) {
      return res.status(400).json({ message: "At least one student is required" });
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
        const [studentResult] = await conn.query(
          `INSERT INTO students (
             parent_id,
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
             medical_condition
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            parentId,
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
            s.medical_condition || null
          ]
        );

        const studentId = (studentResult as any).insertId;
        const classId = classIdByCode.get(s.class_code.trim())!;
        await conn.query(
          `INSERT INTO student_classes (student_id, class_id) VALUES (?, ?)`,
          [studentId, classId]
        );
      }

      await conn.commit();
      res.status(201).json({ message: "Parent registration submitted. Pending approval." });
    } catch (err: any) {
      await conn.rollback();
      console.error(err);
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      res.status(500).json({ message: "Parent registration failed" });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   STAFF REGISTRATION — ALWAYS PENDING APPROVAL
   ============================================================ */
router.post("/register-staff", async (req, res) => {
  try {
    const {
      user_type,
      first_name,
      middle_name,
      surname,
      gender,              // ⭐ NEW
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

    // ⭐ NEW — Gender validation
    if (!isNonEmpty(gender)) {
      return res.status(400).json({ message: "Gender is required" });
    }

    if (!isNonEmpty(email) || !isNonEmpty(password)) {
      return res.status(400).json({ message: "Email and password required" });
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

      // ⭐ UPDATED — gender added to staff_details
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
      console.error(err);
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      res.status(500).json({ message: "Staff registration failed" });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   LOGIN / LOGOUT / ME
   ============================================================ */

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!isNonEmpty(username) || !isNonEmpty(password)) {
      return res.status(400).json({ message: "Username/email and password required" });
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.email, u.password_hash, u.school_id, r.name as role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.username = ? OR u.email = ?`,
      [username, username]
    );

    const user = (rows as any)[0];
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, schoolId: user.school_id },
      env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: "lax"
    });

    res.json({ message: "Logged in", role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

router.get("/me", authMiddleware, async (req: AuthenticatedRequest, res) => {
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
    console.error("Error loading user details:", err);
    res.json({ user: req.user });
  }
});

export default router;
