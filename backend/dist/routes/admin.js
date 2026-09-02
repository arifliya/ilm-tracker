"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../config/db");
const logger_1 = require("../utils/logger");
const auth_1 = require("../middleware/auth");
const featureFlags_1 = require("../utils/featureFlags");
const csv_1 = require("../utils/csv");
const guardianCode_1 = require("../utils/guardianCode");
const tempPassword_1 = require("../utils/tempPassword");
const env_1 = require("../config/env");
const asyncHandler_1 = require("../utils/asyncHandler");
const httpError_1 = require("../utils/httpError");
const router = (0, express_1.Router)();
const STAFF_MGMT = (0, auth_1.requireRole)("admin", "owner", "system_admin");
const USER_MGMT = (0, auth_1.requireRole)("owner", "maintainer", "system_admin");
const REPORT_ROLES = (0, auth_1.requireRole)("admin", "owner");
// Deliberately narrower than every other gate in this file — bulk student
// import is restricted to the school's own admin only, not owner or
// system_admin, per the product decision behind this feature.
const ADMIN_ONLY = (0, auth_1.requireRole)("admin");
const isNonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const MAX_BULK_UPLOAD_ROWS = 500;
// Same skip-under-Jest convention as auth.ts's rate limiters.
const isTestEnv = () => env_1.env.NODE_ENV === "test";
// Not a password-guessing target like /auth/change-password (no password
// is submitted here) — this throttles how fast a compromised/careless
// STAFF_MGMT session could mass-reset other accounts' passwords. Same
// shape as auth.ts's registrationLimiter: enough headroom for genuine
// bulk onboarding, still a backstop against abuse.
const resetPasswordLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isTestEnv,
    message: { message: "Too many password resets. Please try again later." }
});
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
/**
 * system_admin is the one platform-level role with no single school — every
 * other role (owner/admin/maintainer/teacher/parent/student) is confined to
 * req.user.schoolId. These helpers keep that rule consistent across every
 * school-scoped endpoint below instead of repeating the branch inline.
 */
const isPlatformWide = (req) => req.user.role === "system_admin";
const inRequesterScope = (req, targetSchoolId) => {
    if (isPlatformWide(req))
        return true;
    return targetSchoolId !== null && targetSchoolId === req.user.schoolId;
};
const getClassSchoolId = async (classId) => {
    const [rows] = await db_1.pool.query("SELECT school_id FROM classes WHERE id = ?", [classId]);
    return rows[0]?.school_id ?? null;
};
const getSchoolCode = async (schoolId) => {
    const [rows] = await db_1.pool.query("SELECT school_code FROM schools WHERE id = ?", [schoolId]);
    return rows[0]?.school_code ?? null;
};
/**
 * Class codes are always "<school_code>-<admin-chosen suffix>" so a code is
 * self-describing about which school it belongs to. The admin only ever
 * types the suffix; this builds (and re-derives, on edit) the full code.
 */
const buildClassCode = (schoolCode, suffix) => `${schoolCode}-${suffix.trim()}`;
const getUserSchoolId = async (userId) => {
    const [rows] = await db_1.pool.query("SELECT school_id FROM users WHERE id = ?", [userId]);
    return rows[0]?.school_id ?? null;
};
const getUserRequestedRole = async (userId) => {
    const [rows] = await db_1.pool.query("SELECT requested_role FROM users WHERE id = ?", [userId]);
    return rows[0]?.requested_role ?? null;
};
const getUserRoleName = async (userId) => {
    const [rows] = await db_1.pool.query("SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?", [userId]);
    return rows[0]?.name ?? null;
};
const getStudentSchoolId = async (studentId) => {
    const [rows] = await db_1.pool.query("SELECT school_id FROM students WHERE id = ?", [studentId]);
    return rows[0]?.school_id ?? null;
};
const getParentSchoolId = async (parentId) => {
    const [rows] = await db_1.pool.query("SELECT school_id FROM parents WHERE id = ?", [parentId]);
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
const detachUserDependencies = async (userId) => {
    const [parentRows] = await db_1.pool.query("SELECT id FROM parents WHERE user_id = ?", [userId]);
    const parent = parentRows[0];
    if (parent) {
        const [countRows] = await db_1.pool.query("SELECT COUNT(*) AS cnt FROM student_guardians WHERE parent_id = ? AND status = 'approved'", [parent.id]);
        if (countRows[0]?.cnt > 0) {
            return { ok: false, message: "Remove all linked students before removing this user" };
        }
        await db_1.pool.query("DELETE FROM parents WHERE id = ?", [parent.id]);
    }
    await db_1.pool.query("DELETE FROM staff_details WHERE user_id = ?", [userId]);
    await db_1.pool.query("DELETE FROM teacher_classes WHERE teacher_id = ?", [userId]);
    await db_1.pool.query("UPDATE students SET user_id = NULL WHERE user_id = ?", [userId]);
    return { ok: true };
};
/* ============================================================
   GET ALL CLASSES
   ============================================================ */
router.get("/classes", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const params = [];
    let where = "";
    if (!isPlatformWide(req)) {
        where = "WHERE c.school_id = ?";
        params.push(req.user.schoolId);
    }
    const [rows] = await db_1.pool.query(`SELECT
         c.id,
         c.school_id,
         sc.name AS school_name,
         sc.school_code AS school_code,
         c.class_name,
         c.class_code,
         c.year_group,
         c.description
       FROM classes c
       JOIN schools sc ON sc.id = c.school_id
       ${where}
       ORDER BY c.id DESC`, params);
    res.json(rows);
}));
/* ============================================================
   CREATE CLASS
   ============================================================ */
router.post("/classes", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { class_name, year_group, description, class_code } = req.body;
    const schoolId = isPlatformWide(req) ? req.body.school_id : req.user.schoolId;
    if (!class_name)
        return res.status(400).json({ message: "Class name required" });
    if (!class_code || !String(class_code).trim())
        return res.status(400).json({ message: "Class code required" });
    if (!schoolId)
        return res.status(400).json({ message: "School is required" });
    const schoolCode = await getSchoolCode(schoolId);
    if (!schoolCode) {
        return res.status(400).json({ message: "School not found" });
    }
    const fullClassCode = buildClassCode(schoolCode, String(class_code));
    try {
        await db_1.pool.query(`INSERT INTO classes (school_id, class_name, class_code, year_group, description)
         VALUES (?, ?, ?, ?, ?)`, [schoolId, class_name, fullClassCode, year_group || null, description || null]);
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
            throw new httpError_1.HttpError(409, "A class with this code already exists for this school");
        }
        throw err;
    }
    res.json({ message: "Class created", class_code: fullClassCode });
}));
/* ============================================================
   UPDATE CLASS DETAILS
   ============================================================ */
router.put("/classes/:id", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classId = String(req.params.id);
    const { class_name, year_group, description, class_code } = req.body;
    if (!class_name)
        return res.status(400).json({ message: "Class name required" });
    if (!class_code || !String(class_code).trim())
        return res.status(400).json({ message: "Class code required" });
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
        return res.status(404).json({ message: "Class not found" });
    }
    const schoolCode = await getSchoolCode(classSchoolId);
    if (!schoolCode) {
        return res.status(400).json({ message: "School not found" });
    }
    const fullClassCode = buildClassCode(schoolCode, String(class_code));
    try {
        await db_1.pool.query(`UPDATE classes
         SET class_name = ?, class_code = ?, year_group = ?, description = ?
         WHERE id = ?`, [class_name, fullClassCode, year_group || null, description || null, classId]);
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
            throw new httpError_1.HttpError(409, "A class with this code already exists for this school");
        }
        throw err;
    }
    res.json({ message: "Class updated", class_code: fullClassCode });
}));
/* ============================================================
   DELETE CLASS (CLEAN UP RELATIONS FIRST)
   ============================================================ */
router.delete("/classes/:id", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classId = String(req.params.id);
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
        return res.status(404).json({ message: "Class not found" });
    }
    await db_1.pool.query("DELETE FROM teacher_classes WHERE class_id = ?", [classId]);
    await db_1.pool.query("DELETE FROM student_classes WHERE class_id = ?", [classId]);
    await db_1.pool.query("DELETE FROM classes WHERE id = ?", [classId]);
    res.json({ message: "Class deleted" });
}));
/* ============================================================
   ASSIGN TEACHER TO CLASS
   ============================================================ */
router.post("/classes/:id/assign-teacher", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classId = String(req.params.id);
    const { teacherUserId } = req.body;
    if (!teacherUserId)
        return res.status(400).json({ message: "Teacher ID required" });
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
        return res.status(404).json({ message: "Class not found" });
    }
    const teacherSchoolId = await getUserSchoolId(teacherUserId);
    if (teacherSchoolId === null || teacherSchoolId !== classSchoolId) {
        return res.status(400).json({ message: "Teacher does not belong to this class's school" });
    }
    await db_1.pool.query(`INSERT INTO teacher_classes (teacher_id, class_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE teacher_id = teacher_id`, [teacherUserId, classId]);
    res.json({ message: "Teacher assigned" });
}));
/* ============================================================
   REMOVE TEACHER FROM CLASS
   ============================================================ */
router.post("/classes/:id/remove-teacher", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classId = String(req.params.id);
    const { teacherUserId } = req.body;
    if (!teacherUserId)
        return res.status(400).json({ message: "Teacher ID required" });
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
        return res.status(404).json({ message: "Class not found" });
    }
    await db_1.pool.query(`DELETE FROM teacher_classes
       WHERE teacher_id = ? AND class_id = ?`, [teacherUserId, classId]);
    res.json({ message: "Teacher removed from class" });
}));
/* ============================================================
   ASSIGN STUDENT TO CLASS
   ============================================================ */
router.post("/classes/:id/assign-student", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classId = String(req.params.id);
    const { studentId } = req.body;
    if (!studentId)
        return res.status(400).json({ message: "Student ID required" });
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
        return res.status(404).json({ message: "Class not found" });
    }
    const studentSchoolId = await getStudentSchoolId(studentId);
    if (studentSchoolId === null || studentSchoolId !== classSchoolId) {
        return res.status(400).json({ message: "Student does not belong to this class's school" });
    }
    await db_1.pool.query(`INSERT INTO student_classes (student_id, class_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE student_id = student_id`, [studentId, classId]);
    res.json({ message: "Student assigned to class" });
}));
/* ============================================================
   REMOVE STUDENT FROM CLASS
   ============================================================ */
router.post("/classes/:id/remove-student", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const classId = String(req.params.id);
    const { studentId } = req.body;
    if (!studentId)
        return res.status(400).json({ message: "Student ID required" });
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
        return res.status(404).json({ message: "Class not found" });
    }
    await db_1.pool.query(`DELETE FROM student_classes
       WHERE student_id = ? AND class_id = ?`, [studentId, classId]);
    res.json({ message: "Student removed from class" });
}));
/* ============================================================
   GET ALL TEACHERS + THEIR ASSIGNED CLASSES
   ============================================================ */
router.get("/teachers", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const params = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
        schoolFilter = "AND u.school_id = ?";
        params.push(req.user.schoolId);
    }
    const [rows] = await db_1.pool.query(`SELECT
         u.id AS teacher_id,
         u.username,
         u.email,
         sd.first_name,
         sd.surname,
         c.id AS class_id,
         c.class_name,
         c.year_group
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN staff_details sd ON sd.user_id = u.id
       LEFT JOIN teacher_classes tc ON tc.teacher_id = u.id
       LEFT JOIN classes c ON c.id = tc.class_id
       WHERE r.name = 'teacher' ${schoolFilter}
       ORDER BY u.id ASC`, params);
    const results = rows;
    const teachersMap = {};
    results.forEach((row) => {
        if (!teachersMap[row.teacher_id]) {
            teachersMap[row.teacher_id] = {
                id: row.teacher_id,
                username: row.username,
                email: row.email,
                first_name: row.first_name,
                surname: row.surname,
                assigned_classes: []
            };
        }
        if (row.class_id) {
            teachersMap[row.teacher_id].assigned_classes.push({
                id: row.class_id,
                class_name: row.class_name,
                year_group: row.year_group
            });
        }
    });
    res.json(Object.values(teachersMap));
}));
/* ============================================================
   DELETE TEACHER (OPTIONAL, USED BY UI)
   ============================================================ */
router.delete("/teachers/:id", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const teacherId = Number(req.params.id);
    const teacherSchoolId = await getUserSchoolId(teacherId);
    if (teacherSchoolId === null || !inRequesterScope(req, teacherSchoolId)) {
        return res.status(404).json({ message: "Teacher not found" });
    }
    const cleanup = await detachUserDependencies(teacherId);
    if (!cleanup.ok) {
        return res.status(400).json({ message: cleanup.message });
    }
    await db_1.pool.query("DELETE FROM users WHERE id = ?", [teacherId]);
    res.json({ message: "Teacher removed" });
}));
/* ============================================================
   STUDENTS + PARENTS OVERVIEW
   ============================================================ */
router.get("/students-parents", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const params = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
        schoolFilter = "WHERE s.school_id = ?";
        params.push(req.user.schoolId);
    }
    const [rows] = await db_1.pool.query(`SELECT
         s.id AS student_id,
         s.school_id AS student_school_id,
         s.first_name AS student_first_name,
         s.middle_name AS student_middle_name,
         s.surname AS student_last_name,
         s.gender AS student_gender,
         s.date_of_birth AS student_date_of_birth,
         s.address1 AS student_address1,
         s.address2 AS student_address2,
         s.address3 AS student_address3,
         s.city AS student_city,
         s.postcode AS student_postcode,
         s.medical_condition AS student_medical_condition,
         s.guardian_code AS student_guardian_code,

         c.id AS class_id,
         c.class_name AS class_name,

         JSON_ARRAYAGG(
           JSON_OBJECT(
             'parent_id', p.id,
             'user_id', p.user_id,
             'first_name', p.first_name,
             'middle_name', p.middle_name,
             'surname', p.surname,
             'relationship_to_student', p.relationship_to_student,
             'contact_number', p.contact_number,
             'email', p.email,
             'medical_condition', p.medical_condition,
             'address1', p.address1,
             'address2', p.address2,
             'address3', p.address3,
             'city', p.city,
             'postcode', p.postcode
           )
         ) AS guardians

       FROM students s
       JOIN student_guardians sg ON sg.student_id = s.id AND sg.status = 'approved'
       JOIN parents p ON p.id = sg.parent_id
       LEFT JOIN student_classes a ON a.student_id = s.id
       LEFT JOIN classes c ON c.id = a.class_id
       ${schoolFilter}
       GROUP BY s.id, c.id
       ORDER BY s.id DESC`, params);
    const normalized = rows.map(row => {
        // mysql2 already parses a JSON_ARRAYAGG result into a native JS
        // array/object (the column reports as MySQL type JSON) — only fall
        // back to JSON.parse for drivers/configs where it comes back as a
        // raw string.
        let guardians = [];
        if (Array.isArray(row.guardians)) {
            guardians = row.guardians;
        }
        else {
            try {
                guardians = JSON.parse(row.guardians || "[]");
            }
            catch {
                guardians = [];
            }
        }
        return { ...row, guardians };
    });
    res.json(normalized);
}));
/* ============================================================
   ALL PARENTS (INCLUDING THOSE WITH NO STUDENTS LEFT)
   students-parents above is an inner join from students, so a parent
   whose last child was removed drops out of it entirely — this endpoint
   exists so Remove Users can still find and remove that parent.
   ============================================================ */
router.get("/parents", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const params = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
        schoolFilter = "WHERE p.school_id = ?";
        params.push(req.user.schoolId);
    }
    const [rows] = await db_1.pool.query(`SELECT
         p.id AS parent_id,
         p.user_id AS parent_user_id,
         p.school_id AS parent_school_id,
         p.first_name AS parent_first_name,
         p.surname AS parent_last_name,
         p.contact_number AS parent_contact_number,
         p.email AS parent_email,
         COUNT(DISTINCT sg.student_id) AS student_count
       FROM parents p
       LEFT JOIN student_guardians sg ON sg.parent_id = p.id AND sg.status = 'approved'
       ${schoolFilter}
       GROUP BY p.id
       ORDER BY p.surname ASC, p.first_name ASC`, params);
    res.json(rows);
}));
/* ============================================================
   STUDENTS ASSIGNED TO CLASSES (FOR UI TABLE)
   ============================================================ */
router.get("/assigned-students", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const params = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
        schoolFilter = "WHERE c.school_id = ?";
        params.push(req.user.schoolId);
    }
    const [rows] = await db_1.pool.query(`SELECT
         sc.class_id,
         c.class_name,
         s.id AS student_id,
         s.first_name AS student_first_name,
         s.surname AS student_last_name
       FROM student_classes sc
       JOIN classes c ON c.id = sc.class_id
       JOIN students s ON s.id = sc.student_id
       ${schoolFilter}
       ORDER BY c.class_name ASC, s.first_name ASC`, params);
    res.json(rows);
}));
/* ============================================================
   GET ALL USERS WITH FULL DETAILS (strict SQL mode safe)
   Option C — Parent-only student display
   ============================================================ */
router.get("/users-all", auth_1.authMiddleware, USER_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const params = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
        schoolFilter = "WHERE u.school_id = ?";
        params.push(req.user.schoolId);
    }
    const [rows] = await db_1.pool.query(`
      SELECT
        u.id,
        u.username,
        u.email AS user_email,
        r.name AS role,
        sc.name AS school_name,

        /* Parent details (1-to-1) */
        MAX(p.first_name) AS parent_first_name,
        MAX(p.middle_name) AS parent_middle_name,
        MAX(p.surname) AS parent_last_name,
        DATE_FORMAT(MAX(p.date_of_birth), '%Y-%m-%d') AS parent_date_of_birth,
        MAX(p.address1) AS parent_address1,
        MAX(p.address2) AS parent_address2,
        MAX(p.address3) AS parent_address3,
        MAX(p.city) AS parent_city,
        MAX(p.postcode) AS parent_postcode,
        MAX(p.medical_condition) AS parent_medical_condition,
        MAX(p.email) AS parent_email,

        /* Staff details (1-to-1) */
        MAX(s.first_name) AS staff_first_name,
        MAX(s.middle_name) AS staff_middle_name,
        MAX(s.surname) AS staff_last_name,
        DATE_FORMAT(MAX(s.date_of_birth), '%Y-%m-%d') AS staff_date_of_birth,
        MAX(s.address1) AS staff_address1,
        MAX(s.address2) AS staff_address2,
        MAX(s.address3) AS staff_address3,
        MAX(s.city) AS staff_city,
        MAX(s.postcode) AS staff_postcode,
        MAX(s.medical_condition) AS staff_medical_condition,
        MAX(s.disability) AS staff_disability,
        MAX(s.email) AS staff_email,

        /* Students (parent-linked only) */
        COALESCE(
          JSON_ARRAYAGG(
            CASE WHEN st.id IS NOT NULL THEN
              JSON_OBJECT(
                'id', st.id,
                'first_name', st.first_name,
                'surname', st.surname,
                'address1', st.address1
              )
            ELSE NULL END
          ),
          JSON_ARRAY()
        ) AS students

      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN schools sc ON sc.id = u.school_id

      LEFT JOIN parents p ON p.user_id = u.id
      LEFT JOIN staff_details s ON s.user_id = u.id
      LEFT JOIN student_guardians sg ON sg.parent_id = p.id AND sg.status = 'approved'
      LEFT JOIN students st ON st.id = sg.student_id

      ${schoolFilter}
      GROUP BY u.id
      ORDER BY u.username ASC
      `, params);
    const normalized = rows.map((u) => {
        // mysql2 already parses a JSON_ARRAYAGG result into a native JS
        // array/object (the column reports as MySQL type JSON) — only fall
        // back to JSON.parse for drivers/configs where it comes back as a
        // raw string.
        let students = [];
        if (Array.isArray(u.students)) {
            students = u.students.filter(Boolean);
        }
        else {
            try {
                students = JSON.parse(u.students || "[]").filter(Boolean);
            }
            catch {
                students = [];
            }
        }
        let first_name = null;
        let middle_name = null;
        let last_name = null;
        let date_of_birth = null;
        let email = u.user_email;
        let address1 = null;
        let address2 = null;
        let address3 = null;
        let city = null;
        let postcode = null;
        let medical_condition = null;
        let disability = null;
        /* Parent user */
        if (u.role === "parent") {
            first_name = u.parent_first_name;
            middle_name = u.parent_middle_name;
            last_name = u.parent_last_name;
            date_of_birth = u.parent_date_of_birth;
            email = u.parent_email || email;
            address1 = u.parent_address1;
            address2 = u.parent_address2;
            address3 = u.parent_address3;
            city = u.parent_city;
            postcode = u.parent_postcode;
            medical_condition = u.parent_medical_condition;
        }
        /* Staff roles */
        if (["teacher", "admin", "maintainer", "staff"].includes(u.role)) {
            first_name = u.staff_first_name || first_name;
            middle_name = u.staff_middle_name || middle_name;
            last_name = u.staff_last_name || last_name;
            date_of_birth = u.staff_date_of_birth || date_of_birth;
            email = u.staff_email || email;
            address1 = u.staff_address1 || address1;
            address2 = u.staff_address2 || address2;
            address3 = u.staff_address3 || address3;
            city = u.staff_city || city;
            postcode = u.staff_postcode || postcode;
            medical_condition = u.staff_medical_condition || medical_condition;
            disability = u.staff_disability;
        }
        /* Owner */
        if (u.role === "owner") {
            first_name = u.staff_first_name || u.parent_first_name || first_name;
            middle_name = u.staff_middle_name || u.parent_middle_name || middle_name;
            last_name = u.staff_last_name || u.parent_last_name || last_name;
            date_of_birth = u.staff_date_of_birth || u.parent_date_of_birth || date_of_birth;
            email = u.staff_email || u.parent_email || email;
            address1 = u.staff_address1 || u.parent_address1 || address1;
            address2 = u.staff_address2 || u.parent_address2 || address2;
            address3 = u.staff_address3 || u.parent_address3 || address3;
            city = u.staff_city || u.parent_city || city;
            postcode = u.staff_postcode || u.parent_postcode || postcode;
            medical_condition = u.staff_medical_condition || u.parent_medical_condition || medical_condition;
            disability = u.staff_disability || disability;
        }
        /* Student user — Option C: NO DETAILS */
        if (u.role === "student") {
            first_name = null;
            last_name = null;
            address1 = null;
            students = []; // student users do NOT show student cards
        }
        return {
            id: u.id,
            username: u.username,
            role: u.role,
            school_name: u.school_name,
            email,
            first_name,
            middle_name,
            last_name,
            date_of_birth,
            address1,
            address2,
            address3,
            city,
            postcode,
            medical_condition,
            disability,
            students
        };
    });
    res.json(normalized);
}));
/* ============================================================
   GET PENDING USERS (WITH REQUESTED ROLE + BASIC DETAILS)
   ============================================================ */
router.get("/pending-users", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const params = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
        schoolFilter = "AND u.school_id = ?";
        params.push(req.user.schoolId);
    }
    const [rows] = await db_1.pool.query(`SELECT
         u.id,
         u.username,
         u.email,
         u.requested_role,
         sc.name AS school_name,
         COALESCE(p.first_name, s.first_name) AS first_name,
         COALESCE(p.surname, s.surname) AS last_name,
         COALESCE(p.contact_number, s.phone_number) AS contact_number
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN schools sc ON sc.id = u.school_id
       LEFT JOIN parents p ON p.user_id = u.id
       LEFT JOIN staff_details s ON s.user_id = u.id
       WHERE r.name = 'pending' ${schoolFilter}
       ORDER BY u.id ASC`, params);
    res.json(rows);
}));
/* ============================================================
   APPROVE USER
   ============================================================ */
router.post("/approve/:id", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = String(req.params.id);
    const { role } = req.body;
    if (!role)
        return res.status(400).json({ message: "Role required" });
    // Admins may only grant roles up to their own privilege level — never owner/maintainer/system_admin
    if (req.user.role === "admin" && ["owner", "maintainer", "system_admin"].includes(role)) {
        return res.status(403).json({ message: "Admins cannot grant owner, maintainer, or system admin roles" });
    }
    // Owners sit below system_admin — they cannot grant system_admin
    if (req.user.role === "owner" && role === "system_admin") {
        return res.status(403).json({ message: "Owners cannot grant the system admin role" });
    }
    const targetSchoolId = await getUserSchoolId(userId);
    if (targetSchoolId === null || !inRequesterScope(req, targetSchoolId)) {
        return res.status(404).json({ message: "User not found" });
    }
    // system_admin is platform-wide and handles staff onboarding across
    // schools, but parent approvals are a school-level decision — those stay
    // with that school's own admin/owner.
    if (isPlatformWide(req) && (await getUserRequestedRole(userId)) === "parent") {
        return res.status(403).json({ message: "System admins cannot approve parent registrations — this must be done by the school's admin or owner" });
    }
    const [roleRows] = await db_1.pool.query("SELECT id FROM roles WHERE name = ?", [role]);
    const roleId = roleRows[0]?.id;
    if (!roleId)
        return res.status(400).json({ message: "Invalid role" });
    await db_1.pool.query("UPDATE users SET role_id = ?, requested_role = NULL WHERE id = ?", [roleId, userId]);
    // A newly-approved parent may have submitted guardian_links to existing
    // children alongside their registration — those were inserted 'pending'
    // since the child wasn't theirs to claim outright. Approving the account
    // is the admin's one review of this whole submission, so flip those too
    // rather than making the admin approve the same registration twice.
    if (role === "parent") {
        const [parentRows] = await db_1.pool.query("SELECT id FROM parents WHERE user_id = ?", [userId]);
        const parent = parentRows[0];
        if (parent) {
            await db_1.pool.query("UPDATE student_guardians SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE parent_id = ? AND status = 'pending'", [parent.id]);
        }
    }
    res.json({ message: "User approved" });
}));
/* ============================================================
   REJECT USER
   ============================================================ */
router.post("/reject/:id", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = String(req.params.id);
    const targetSchoolId = await getUserSchoolId(userId);
    if (targetSchoolId === null || !inRequesterScope(req, targetSchoolId)) {
        return res.status(404).json({ message: "User not found" });
    }
    if (isPlatformWide(req) && (await getUserRequestedRole(userId)) === "parent") {
        return res.status(403).json({ message: "System admins cannot reject parent registrations — this must be done by the school's admin or owner" });
    }
    // Pending registrations aren't real enrollments yet, so rejecting one
    // wipes the whole submission — but with multiple guardians possible, a
    // student this parent is linked to might not have been CREATED by this
    // registration (e.g. a guardian_links request to a child that already
    // has another approved guardian) — that student must survive rejection.
    // Only students where this parent is the sole (only ever) guardian were
    // created by this registration, so only those get wiped entirely; any
    // other pending link is just a request and gets dropped on its own.
    const [parentRows] = await db_1.pool.query("SELECT id FROM parents WHERE user_id = ?", [userId]);
    const parent = parentRows[0];
    if (parent) {
        const [soleRows] = await db_1.pool.query(`SELECT sg.student_id FROM student_guardians sg
         WHERE sg.parent_id = ?
           AND (SELECT COUNT(*) FROM student_guardians sg2 WHERE sg2.student_id = sg.student_id) = 1`, [parent.id]);
        const soleStudentIds = soleRows.map(r => r.student_id);
        if (soleStudentIds.length > 0) {
            await db_1.pool.query("DELETE FROM student_classes WHERE student_id IN (?)", [soleStudentIds]);
            await db_1.pool.query("DELETE FROM students WHERE id IN (?)", [soleStudentIds]);
        }
        // Any remaining student_guardians rows for this parent are requests
        // against children that already had another guardian — drop the
        // request only, leave the student alone.
        await db_1.pool.query("DELETE FROM student_guardians WHERE parent_id = ?", [parent.id]);
        await db_1.pool.query("DELETE FROM parents WHERE id = ?", [parent.id]);
    }
    await db_1.pool.query("DELETE FROM staff_details WHERE user_id = ?", [userId]);
    await db_1.pool.query("DELETE FROM users WHERE id = ?", [userId]);
    res.json({ message: "User rejected" });
}));
/* ============================================================
   RESET A USER'S PASSWORD — FOR A LOCKED-OUT ACCOUNT
   Behind the "password_management" flag, checked against the TARGET's
   school (not the caller's) — same resource-scoped pattern reportCards.ts
   uses. Same escalation rules as /approve/:id: admin cannot act on
   owner/maintainer/system_admin; owner cannot act on system_admin.
   ============================================================ */
router.post("/users/:id/reset-password", auth_1.authMiddleware, STAFF_MGMT, resetPasswordLimiter, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = String(req.params.id);
    const targetSchoolId = await getUserSchoolId(userId);
    if (targetSchoolId === null || !inRequesterScope(req, targetSchoolId)) {
        return res.status(404).json({ message: "User not found" });
    }
    const targetRole = await getUserRoleName(userId);
    if (req.user.role === "admin" && targetRole && ["owner", "maintainer", "system_admin"].includes(targetRole)) {
        return res.status(403).json({ message: "Admins cannot reset the password of an owner, maintainer, or system admin" });
    }
    if (req.user.role === "owner" && targetRole === "system_admin") {
        return res.status(403).json({ message: "Owners cannot reset a system admin's password" });
    }
    if (!(await (0, featureFlags_1.isFeatureEnabled)("password_management", targetSchoolId))) {
        return res.status(403).json({ message: "Password management is currently disabled for this school" });
    }
    const temporaryPassword = (0, tempPassword_1.generateTemporaryPassword)();
    const newHash = await bcryptjs_1.default.hash(temporaryPassword, 10);
    await db_1.pool.query("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?", [newHash, userId]);
    res.json({ message: "Password reset", temporaryPassword });
}));
/* ============================================================
   REMOVE STUDENT (FIRST)
   ============================================================ */
router.delete("/remove-student/:id", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentId = String(req.params.id);
    const studentSchoolId = await getStudentSchoolId(studentId);
    if (studentSchoolId === null || !inRequesterScope(req, studentSchoolId)) {
        return res.status(404).json({ message: "Student not found" });
    }
    await db_1.pool.query("DELETE FROM student_classes WHERE student_id = ?", [studentId]);
    await db_1.pool.query("DELETE FROM students WHERE id = ?", [studentId]);
    res.json({ message: "Student removed" });
}));
/* ============================================================
   REMOVE PARENT (ONLY IF NO STUDENTS)
   ============================================================ */
router.delete("/remove-parent/:id", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const parentId = String(req.params.id);
    const parentSchoolId = await getParentSchoolId(parentId);
    if (parentSchoolId === null || !inRequesterScope(req, parentSchoolId)) {
        return res.status(404).json({ message: "Parent not found" });
    }
    const [rows] = await db_1.pool.query("SELECT COUNT(*) AS cnt FROM student_guardians WHERE parent_id = ? AND status = 'approved'", [parentId]);
    const count = rows[0]?.cnt || 0;
    if (count > 0) {
        return res
            .status(400)
            .json({ message: "Remove all linked students before removing this parent" });
    }
    const [parentRows] = await db_1.pool.query("SELECT user_id FROM parents WHERE id = ?", [parentId]);
    const userId = parentRows[0]?.user_id;
    await db_1.pool.query("DELETE FROM parents WHERE id = ?", [parentId]);
    // Also remove the login itself — otherwise a "removed" parent can
    // still sign in afterward.
    if (userId) {
        await db_1.pool.query("DELETE FROM users WHERE id = ?", [userId]);
    }
    res.json({ message: "Parent removed" });
}));
/* ============================================================
   PENDING GUARDIAN LINK REQUESTS
   Self-service guardian_code requests submitted by an already-approved,
   already-logged-in parent (via POST /parent/link-guardian) — these have no
   accompanying user-approval action to ride along with, so they need this
   dedicated review surface.
   ============================================================ */
router.get("/guardian-requests", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const params = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
        schoolFilter = "AND s.school_id = ?";
        params.push(req.user.schoolId);
    }
    const [rows] = await db_1.pool.query(`SELECT
         sg.student_id,
         sg.parent_id,
         sg.requested_at,
         s.first_name AS student_first_name,
         s.surname AS student_last_name,
         s.school_id,
         p.first_name AS parent_first_name,
         p.surname AS parent_last_name,
         p.email AS parent_email,
         p.contact_number AS parent_contact_number
       FROM student_guardians sg
       JOIN students s ON s.id = sg.student_id
       JOIN parents p ON p.id = sg.parent_id
       WHERE sg.status = 'pending' ${schoolFilter}
       ORDER BY sg.requested_at ASC`, params);
    res.json(rows);
}));
router.post("/guardian-requests/approve", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { student_id, parent_id } = req.body;
    if (!student_id || !parent_id) {
        return res.status(400).json({ message: "student_id and parent_id are required" });
    }
    const studentSchoolId = await getStudentSchoolId(student_id);
    if (studentSchoolId === null || !inRequesterScope(req, studentSchoolId)) {
        return res.status(404).json({ message: "Student not found" });
    }
    const [result] = await db_1.pool.query("UPDATE student_guardians SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE student_id = ? AND parent_id = ? AND status = 'pending'", [student_id, parent_id]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: "No pending request found for this student and parent" });
    }
    res.json({ message: "Guardian request approved" });
}));
router.post("/guardian-requests/reject", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { student_id, parent_id } = req.body;
    if (!student_id || !parent_id) {
        return res.status(400).json({ message: "student_id and parent_id are required" });
    }
    const studentSchoolId = await getStudentSchoolId(student_id);
    if (studentSchoolId === null || !inRequesterScope(req, studentSchoolId)) {
        return res.status(404).json({ message: "Student not found" });
    }
    const [result] = await db_1.pool.query("DELETE FROM student_guardians WHERE student_id = ? AND parent_id = ? AND status = 'pending'", [student_id, parent_id]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: "No pending request found for this student and parent" });
    }
    res.json({ message: "Guardian request rejected" });
}));
/* ============================================================
   ASSIGN GUARDIAN TO STUDENT (ADMIN-DIRECT — INSTANTLY APPROVED)
   The admin's action is itself the approval — no pending state. Upserts,
   so this also transparently handles "admin approves a parent who already
   had a pending self-service request for this student" in one call.
   ============================================================ */
router.post("/students/:studentId/assign-guardian", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentId = String(req.params.studentId);
    const { parent_id } = req.body;
    if (!parent_id)
        return res.status(400).json({ message: "parent_id is required" });
    const studentSchoolId = await getStudentSchoolId(studentId);
    if (studentSchoolId === null || !inRequesterScope(req, studentSchoolId)) {
        return res.status(404).json({ message: "Student not found" });
    }
    const parentSchoolId = await getParentSchoolId(parent_id);
    if (parentSchoolId === null || parentSchoolId !== studentSchoolId) {
        return res.status(400).json({ message: "Parent does not belong to this student's school" });
    }
    await db_1.pool.query(`INSERT INTO student_guardians (student_id, parent_id, status, approved_at)
       VALUES (?, ?, 'approved', CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE status = 'approved', approved_at = CURRENT_TIMESTAMP`, [studentId, parent_id]);
    res.json({ message: "Guardian assigned" });
}));
/* ============================================================
   REMOVE GUARDIAN FROM STUDENT
   Blocked while it's the student's only approved guardian — a student must
   always have at least one.
   ============================================================ */
router.post("/students/:studentId/remove-guardian", auth_1.authMiddleware, STAFF_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const studentId = String(req.params.studentId);
    const { parent_id } = req.body;
    if (!parent_id)
        return res.status(400).json({ message: "parent_id is required" });
    const studentSchoolId = await getStudentSchoolId(studentId);
    if (studentSchoolId === null || !inRequesterScope(req, studentSchoolId)) {
        return res.status(404).json({ message: "Student not found" });
    }
    const [countRows] = await db_1.pool.query("SELECT COUNT(*) AS cnt FROM student_guardians WHERE student_id = ? AND status = 'approved'", [studentId]);
    if (countRows[0]?.cnt <= 1) {
        return res.status(400).json({ message: "A student must have at least one guardian" });
    }
    await db_1.pool.query("DELETE FROM student_guardians WHERE student_id = ? AND parent_id = ? AND status = 'approved'", [studentId, parent_id]);
    res.json({ message: "Guardian removed" });
}));
/* ============================================================
   GET ALL ROLES
   ============================================================ */
router.get("/roles", auth_1.authMiddleware, (0, auth_1.requireRole)("admin", "owner", "maintainer", "system_admin"), (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const [rows] = await db_1.pool.query("SELECT id, name FROM roles ORDER BY name ASC");
    res.json(rows);
}));
/* ============================================================
   ADD NEW ROLE
   ============================================================ */
router.post("/roles/add", auth_1.authMiddleware, (0, auth_1.requireRole)("owner", "maintainer", "system_admin"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const name = (req.body?.name || "").toString().trim().toLowerCase();
    if (!name) {
        return res.status(200).json({ success: false, message: "Role name cannot be empty" });
    }
    if (!/^[a-z][a-z0-9_-]{1,49}$/.test(name)) {
        return res.status(200).json({
            success: false,
            message: "Role name must start with a letter and contain only lowercase letters, numbers, hyphens, or underscores"
        });
    }
    const [existing] = await db_1.pool.query("SELECT id FROM roles WHERE name = ?", [name]);
    if (existing.length > 0) {
        return res.status(200).json({ success: false, message: "A role with this name already exists" });
    }
    await db_1.pool.query("INSERT INTO roles (name) VALUES (?)", [name]);
    res.json({ success: true, message: "Role added successfully" });
}));
/* ============================================================
   DELETE USER (NEW)
   ============================================================ */
router.delete("/users/:id", auth_1.authMiddleware, USER_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = Number(req.params.id);
    // Prevent deleting the system owner or a system admin
    const [rows] = await db_1.pool.query(`SELECT r.name AS role, u.school_id
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`, [userId]);
    const user = rows[0];
    if (!user || !inRequesterScope(req, user.school_id)) {
        return res.status(404).json({ message: "User not found" });
    }
    if (user.role === "owner" || user.role === "system_admin") {
        return res.status(403).json({ message: "Owner and system admin accounts cannot be deleted" });
    }
    const cleanup = await detachUserDependencies(userId);
    if (!cleanup.ok) {
        return res.status(400).json({ message: cleanup.message });
    }
    // Delete user
    await db_1.pool.query("DELETE FROM users WHERE id = ?", [userId]);
    res.json({ message: "User deleted" });
}));
/* ============================================================
   UPDATE USER DETAILS (parent or staff profile fields)
   ============================================================ */
router.put("/users/:id/update-details", auth_1.authMiddleware, USER_MGMT, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = Number(req.params.id);
    const { first_name, middle_name, last_name, date_of_birth, address1, address2, address3, city, postcode, medical_condition, disability, email } = req.body;
    const [roleRows] = await db_1.pool.query(`SELECT r.name AS role, u.school_id
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`, [userId]);
    const targetUser = roleRows[0];
    const role = targetUser?.role;
    if (!role || !inRequesterScope(req, targetUser.school_id)) {
        return res.status(404).json({ message: "User not found" });
    }
    try {
        if (role === "parent") {
            const [existing] = await db_1.pool.query("SELECT id FROM parents WHERE user_id = ?", [userId]);
            if (existing.length > 0) {
                await db_1.pool.query(`UPDATE parents
             SET first_name = ?, middle_name = ?, surname = ?, date_of_birth = ?,
                 address1 = ?, address2 = ?, address3 = ?, city = ?, postcode = ?,
                 medical_condition = ?, email = ?
             WHERE user_id = ?`, [
                    first_name || null, middle_name || null, last_name || null, date_of_birth || null,
                    address1 || null, address2 || null, address3 || null, city || null, postcode || null,
                    medical_condition || null, email || null, userId
                ]);
            }
            else {
                await db_1.pool.query(`INSERT INTO parents
               (user_id, first_name, middle_name, surname, date_of_birth,
                address1, address2, address3, city, postcode, medical_condition, email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    userId, first_name || null, middle_name || null, last_name || null, date_of_birth || null,
                    address1 || null, address2 || null, address3 || null, city || null, postcode || null,
                    medical_condition || null, email || null
                ]);
            }
        }
        else if (["teacher", "admin", "maintainer", "owner", "staff", "system_admin"].includes(role)) {
            const [existing] = await db_1.pool.query("SELECT id FROM staff_details WHERE user_id = ?", [userId]);
            if (existing.length > 0) {
                await db_1.pool.query(`UPDATE staff_details
             SET first_name = ?, middle_name = ?, surname = ?, date_of_birth = ?,
                 address1 = ?, address2 = ?, address3 = ?, city = ?, postcode = ?,
                 medical_condition = ?, disability = ?, email = ?
             WHERE user_id = ?`, [
                    first_name || null, middle_name || null, last_name || null, date_of_birth || null,
                    address1 || null, address2 || null, address3 || null, city || null, postcode || null,
                    medical_condition || null, disability || null, email || null, userId
                ]);
            }
            else {
                await db_1.pool.query(`INSERT INTO staff_details
               (user_id, first_name, middle_name, surname, date_of_birth,
                address1, address2, address3, city, postcode, medical_condition, disability, email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    userId, first_name || null, middle_name || null, last_name || null, date_of_birth || null,
                    address1 || null, address2 || null, address3 || null, city || null, postcode || null,
                    medical_condition || null, disability || null, email || null
                ]);
            }
        }
        else {
            return res.status(400).json({ message: "This user's role does not support detail editing" });
        }
        // Keep the login-lookup email in sync with the profile email
        if (email) {
            await db_1.pool.query("UPDATE users SET email = ? WHERE id = ?", [email, userId]);
        }
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
            throw new httpError_1.HttpError(409, "Another account already uses this email");
        }
        throw err;
    }
    res.json({ message: "User details updated" });
}));
/* ============================================================
   DOWNLOAD ATTENDANCE REPORT (CSV) — ADMIN / OWNER
   Filters: optional classId (defaults to all classes) and an optional
   date range, which cannot reach further back than 365 days.
   ============================================================ */
router.get("/attendance/report", auth_1.authMiddleware, REPORT_ROLES, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!(await (0, featureFlags_1.isFeatureEnabled)("attendance_report", req.user.schoolId))) {
        return res.status(403).json({ message: "The attendance report feature is currently disabled" });
    }
    const classIdParam = req.query.classId;
    const startDateParam = req.query.startDate;
    const endDateParam = req.query.endDate;
    const today = todayStr();
    const oneYearAgo = daysAgoStr(365);
    const startDate = typeof startDateParam === "string" && startDateParam ? startDateParam : oneYearAgo;
    const endDate = typeof endDateParam === "string" && endDateParam ? endDateParam : today;
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
        return res.status(400).json({ message: "Invalid date format, expected YYYY-MM-DD" });
    }
    if (startDate > endDate) {
        return res.status(400).json({ message: "Start date must be before end date" });
    }
    if (startDate < oneYearAgo) {
        return res.status(400).json({ message: "Start date cannot be more than a year ago" });
    }
    if (endDate > today) {
        return res.status(400).json({ message: "End date cannot be in the future" });
    }
    const classId = classIdParam ? Number(classIdParam) : null;
    if (classId) {
        const classSchoolId = await getClassSchoolId(classId);
        if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
            return res.status(404).json({ message: "Class not found" });
        }
    }
    const params = [startDate, endDate];
    let classFilter = "";
    if (classId) {
        classFilter = "AND a.class_id = ?";
        params.push(classId);
    }
    else {
        classFilter = "AND c.school_id = ?";
        params.push(req.user.schoolId);
    }
    const [rows] = await db_1.pool.query(`SELECT
         DATE_FORMAT(a.date, '%Y-%m-%d') AS date,
         s.first_name,
         s.surname,
         c.class_name,
         a.status
       FROM attendance a
       JOIN students s ON s.id = a.student_id
       JOIN classes c ON c.id = a.class_id
       WHERE a.date BETWEEN ? AND ? ${classFilter}
       ORDER BY c.class_name ASC, a.date ASC, s.first_name ASC, s.surname ASC`, params);
    const csv = (0, csv_1.toCsv)(["Date", "First Name", "Last Name", "Class", "Attendance"], rows.map(r => [
        r.date,
        r.first_name,
        r.surname,
        r.class_name,
        r.status === "PRESENT" ? "Present" : "Absent"
    ]));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="attendance_report_${startDate}_to_${endDate}.csv"`);
    res.send(csv);
}));
/* ============================================================
   ANALYTICS DASHBOARD
   Attendance trend + students-per-class, behind the
   "analytics_dashboard" flag. The attendance trend range is either the
   school's current term (school_terms row covering today) or a trailing
   365-day window — no academic-year concept exists in this schema, so
   "year" means the last 365 days, not a calendar/school year.

   Fees trend is a separate chart, gated by its own "fees" flag (a school
   can have analytics on without fees, or vice versa) — collected vs
   outstanding amounts either per fee_period ("month") or summed by
   calendar year of the period's start_date ("year").
   ============================================================ */
const resolveCurrentTerm = async (schoolId, today) => {
    const [rows] = await db_1.pool.query(`SELECT name, start_date, end_date FROM school_terms
     WHERE school_id = ? AND start_date <= ? AND end_date >= ?
     ORDER BY start_date ASC LIMIT 1`, [schoolId, today, today]);
    return rows[0] ?? null;
};
router.get("/analytics", auth_1.authMiddleware, REPORT_ROLES, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schoolId = req.user.schoolId;
    if (!(await (0, featureFlags_1.isFeatureEnabled)("analytics_dashboard", schoolId))) {
        return res.status(403).json({ message: "The analytics dashboard feature is currently disabled" });
    }
    const range = typeof req.query.range === "string" ? req.query.range : "term";
    if (range !== "term" && range !== "year") {
        return res.status(400).json({ message: "range must be 'term' or 'year'" });
    }
    const feesRange = typeof req.query.feesRange === "string" ? req.query.feesRange : "month";
    if (feesRange !== "month" && feesRange !== "year") {
        return res.status(400).json({ message: "feesRange must be 'month' or 'year'" });
    }
    const today = todayStr();
    let rangeStart;
    let rangeEnd;
    let termName = null;
    if (range === "year") {
        rangeStart = daysAgoStr(365);
        rangeEnd = today;
    }
    else {
        const term = await resolveCurrentTerm(schoolId, today);
        if (term) {
            rangeStart = term.start_date;
            rangeEnd = term.end_date < today ? term.end_date : today;
            termName = term.name;
        }
        else {
            rangeStart = daysAgoStr(30);
            rangeEnd = today;
        }
    }
    const [attendanceRows] = await db_1.pool.query(`SELECT
         DATE_FORMAT(a.date, '%Y-%m-%d') AS date,
         SUM(a.status = 'PRESENT') AS present_count,
         COUNT(*) AS total_count
       FROM attendance a
       JOIN classes c ON c.id = a.class_id
       WHERE c.school_id = ? AND a.date BETWEEN ? AND ?
       GROUP BY a.date
       ORDER BY a.date ASC`, [schoolId, rangeStart, rangeEnd]);
    const [classRows] = await db_1.pool.query(`SELECT c.id AS class_id, c.class_name, COUNT(sc.student_id) AS student_count
       FROM classes c
       LEFT JOIN student_classes sc ON sc.class_id = c.id
       WHERE c.school_id = ?
       GROUP BY c.id, c.class_name
       ORDER BY c.class_name ASC`, [schoolId]);
    // Fees is its own feature (independent of analytics_dashboard), so this
    // chart only appears once a school has both turned on — same LEFT JOIN
    // shape as the fees list endpoint, just aggregated instead of per-row.
    let feesTrend = null;
    if (await (0, featureFlags_1.isFeatureEnabled)("fees", schoolId)) {
        const feesQuery = feesRange === "year"
            ? `SELECT YEAR(fp.start_date) AS label,
                    SUM(CASE WHEN sf.status = 'paid' THEN sf.amount ELSE 0 END) AS collected,
                    SUM(CASE WHEN sf.status = 'unpaid' THEN sf.amount ELSE 0 END) AS outstanding
             FROM fee_periods fp
             LEFT JOIN student_fees sf ON sf.fee_period_id = fp.id
             WHERE fp.school_id = ?
             GROUP BY YEAR(fp.start_date)
             ORDER BY YEAR(fp.start_date) ASC`
            : `SELECT fp.name AS label,
                    SUM(CASE WHEN sf.status = 'paid' THEN sf.amount ELSE 0 END) AS collected,
                    SUM(CASE WHEN sf.status = 'unpaid' THEN sf.amount ELSE 0 END) AS outstanding
             FROM fee_periods fp
             LEFT JOIN student_fees sf ON sf.fee_period_id = fp.id
             WHERE fp.school_id = ?
             GROUP BY fp.id, fp.name, fp.start_date
             ORDER BY fp.start_date ASC`;
        const [feesRows] = await db_1.pool.query(feesQuery, [schoolId]);
        feesTrend = {
            range: feesRange,
            points: feesRows.map(r => ({
                label: String(r.label),
                collected: Number(r.collected),
                outstanding: Number(r.outstanding)
            }))
        };
    }
    res.json({
        attendanceTrend: {
            range,
            rangeStart,
            rangeEnd,
            termName,
            points: attendanceRows.map(r => ({
                date: r.date,
                rate: r.total_count > 0 ? Number(r.present_count) / Number(r.total_count) : null
            }))
        },
        studentsPerClass: classRows.map(r => ({
            classId: r.class_id,
            className: r.class_name || "(Unnamed class)",
            studentCount: Number(r.student_count)
        })),
        feesTrend
    });
}));
/* ============================================================
   BULK STUDENT UPLOAD (CSV, PARSED CLIENT-SIDE) — ADMIN ONLY
   Each row either links to an existing parent (matched by email, within
   this school) as an additional guardian, or creates a brand-new parent
   account. This app has no password-reset/email flow, so a newly-created
   parent's one-time password is generated here and returned in that row's
   result for the admin to relay out of band — never stored anywhere but
   its hash.
   Each row runs in its own transaction so one bad row doesn't roll back
   the rest of the batch — that per-row try/catch deliberately swallows and
   records the error rather than rethrowing, so it stays untouched by the
   asyncHandler/HttpError pattern used elsewhere in this file.
   ============================================================ */
router.post("/students/bulk-upload", auth_1.authMiddleware, ADMIN_ONLY, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schoolId = req.user.schoolId;
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "At least one row is required" });
    }
    if (rows.length > MAX_BULK_UPLOAD_ROWS) {
        return res.status(400).json({ message: `Cannot upload more than ${MAX_BULK_UPLOAD_ROWS} rows at once` });
    }
    const [roleRows] = await db_1.pool.query("SELECT id FROM roles WHERE name = 'parent'");
    const parentRoleId = roleRows[0]?.id;
    if (!parentRoleId) {
        return res.status(500).json({ message: "Parent role missing in DB" });
    }
    const results = [];
    for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 1;
        const row = rows[i] || {};
        const missing = [];
        if (!isNonEmpty(row.student_first_name))
            missing.push("student_first_name");
        if (!isNonEmpty(row.student_surname))
            missing.push("student_surname");
        if (!isNonEmpty(row.student_gender))
            missing.push("student_gender");
        if (!isNonEmpty(row.student_date_of_birth))
            missing.push("student_date_of_birth");
        if (!isNonEmpty(row.class_code))
            missing.push("class_code");
        if (!isNonEmpty(row.parent_first_name))
            missing.push("parent_first_name");
        if (!isNonEmpty(row.parent_surname))
            missing.push("parent_surname");
        if (!isNonEmpty(row.parent_relationship_to_student))
            missing.push("parent_relationship_to_student");
        if (!isNonEmpty(row.parent_contact_number))
            missing.push("parent_contact_number");
        if (!isNonEmpty(row.parent_email))
            missing.push("parent_email");
        if (missing.length > 0) {
            results.push({ row: rowNum, status: "error", message: `Missing required field(s): ${missing.join(", ")}` });
            continue;
        }
        const parentEmail = String(row.parent_email).trim();
        const [classRows] = await db_1.pool.query("SELECT id FROM classes WHERE school_id = ? AND class_code = ? LIMIT 1", [schoolId, String(row.class_code).trim()]);
        const classId = classRows[0]?.id;
        if (!classId) {
            results.push({ row: rowNum, status: "error", message: `Invalid class code: ${row.class_code}` });
            continue;
        }
        const [userRows] = await db_1.pool.query(`SELECT u.id, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ? LIMIT 1`, [parentEmail]);
        const existingUser = userRows[0];
        if (existingUser && existingUser.role_name !== "parent") {
            results.push({ row: rowNum, status: "error", message: `${parentEmail} belongs to a non-parent account` });
            continue;
        }
        const conn = await db_1.pool.getConnection();
        try {
            await conn.beginTransaction();
            let parentId;
            let parentCreated = false;
            let temporaryPassword;
            if (existingUser) {
                const [parentRows] = await conn.query("SELECT id FROM parents WHERE user_id = ?", [existingUser.id]);
                const existingParent = parentRows[0];
                if (!existingParent) {
                    throw new Error(`${parentEmail} is a parent-role account with no parent profile`);
                }
                parentId = existingParent.id;
            }
            else {
                temporaryPassword = (0, tempPassword_1.generateTemporaryPassword)();
                const passwordHash = await bcryptjs_1.default.hash(temporaryPassword, 10);
                const [userResult] = await conn.query(`INSERT INTO users (username, email, password_hash, role_id, school_id) VALUES (?, ?, ?, ?, ?)`, [`${row.parent_first_name} ${row.parent_surname}`, parentEmail, passwordHash, parentRoleId, schoolId]);
                const newUserId = userResult.insertId;
                const [parentResult] = await conn.query(`INSERT INTO parents (
               user_id, school_id, first_name, middle_name, surname, relationship_to_student,
               date_of_birth, address1, address2, address3, city, postcode, medical_condition,
               contact_number, email
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
                ]);
                parentId = parentResult.insertId;
                parentCreated = true;
            }
            const guardianCode = await (0, guardianCode_1.generateUniqueGuardianCode)(conn, schoolId);
            const [studentResult] = await conn.query(`INSERT INTO students (
             school_id, first_name, middle_name, surname, gender, date_of_birth,
             address1, address2, address3, city, postcode, medical_condition, guardian_code
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
            ]);
            const studentId = studentResult.insertId;
            await conn.query("INSERT INTO student_guardians (student_id, parent_id, status, approved_at) VALUES (?, ?, 'approved', CURRENT_TIMESTAMP)", [studentId, parentId]);
            await conn.query("INSERT INTO student_classes (student_id, class_id) VALUES (?, ?)", [studentId, classId]);
            await conn.commit();
            results.push({ row: rowNum, status: "created", studentId, parentCreated, temporaryPassword });
        }
        catch (err) {
            await conn.rollback();
            logger_1.logger.error({ err, row: rowNum }, "Bulk student upload row error");
            const message = err?.code === "ER_DUP_ENTRY" ? "Duplicate entry (this email or address already exists)" : "Failed to create this row";
            results.push({ row: rowNum, status: "error", message });
        }
        finally {
            conn.release();
        }
    }
    const succeeded = results.filter(r => r.status === "created").length;
    res.json({
        summary: { total: rows.length, succeeded, failed: rows.length - succeeded },
        results
    });
}));
exports.default = router;
