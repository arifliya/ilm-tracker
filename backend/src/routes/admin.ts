import { Router } from "express";
import { pool } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/auth";
import { isFeatureEnabled } from "../utils/featureFlags";
import { toCsv } from "../utils/csv";

const router = Router();

const STAFF_MGMT = requireRole("admin", "owner", "system_admin");
const USER_MGMT = requireRole("owner", "maintainer", "system_admin");
const REPORT_ROLES = requireRole("admin", "owner");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * system_admin is the one platform-level role with no single school — every
 * other role (owner/admin/maintainer/teacher/parent/student) is confined to
 * req.user.schoolId. These helpers keep that rule consistent across every
 * school-scoped endpoint below instead of repeating the branch inline.
 */
const isPlatformWide = (req: AuthenticatedRequest) => req.user!.role === "system_admin";

const inRequesterScope = (req: AuthenticatedRequest, targetSchoolId: number | null) => {
  if (isPlatformWide(req)) return true;
  return targetSchoolId !== null && targetSchoolId === req.user!.schoolId;
};

const getClassSchoolId = async (classId: string | number): Promise<number | null> => {
  const [rows] = await pool.query("SELECT school_id FROM classes WHERE id = ?", [classId]);
  return (rows as any[])[0]?.school_id ?? null;
};

const getSchoolCode = async (schoolId: string | number): Promise<string | null> => {
  const [rows] = await pool.query("SELECT school_code FROM schools WHERE id = ?", [schoolId]);
  return (rows as any[])[0]?.school_code ?? null;
};

/**
 * Class codes are always "<school_code>-<admin-chosen suffix>" so a code is
 * self-describing about which school it belongs to. The admin only ever
 * types the suffix; this builds (and re-derives, on edit) the full code.
 */
const buildClassCode = (schoolCode: string, suffix: string) => `${schoolCode}-${suffix.trim()}`;

const getUserSchoolId = async (userId: string | number): Promise<number | null> => {
  const [rows] = await pool.query("SELECT school_id FROM users WHERE id = ?", [userId]);
  return (rows as any[])[0]?.school_id ?? null;
};

const getUserRequestedRole = async (userId: string | number): Promise<string | null> => {
  const [rows] = await pool.query("SELECT requested_role FROM users WHERE id = ?", [userId]);
  return (rows as any[])[0]?.requested_role ?? null;
};

const getStudentSchoolId = async (studentId: string | number): Promise<number | null> => {
  const [rows] = await pool.query("SELECT school_id FROM students WHERE id = ?", [studentId]);
  return (rows as any[])[0]?.school_id ?? null;
};

const getParentSchoolId = async (parentId: string | number): Promise<number | null> => {
  const [rows] = await pool.query("SELECT school_id FROM parents WHERE id = ?", [parentId]);
  return (rows as any[])[0]?.school_id ?? null;
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
  userId: number
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const [parentRows] = await pool.query("SELECT id FROM parents WHERE user_id = ?", [userId]);
  const parent = (parentRows as any[])[0];

  if (parent) {
    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM students WHERE parent_id = ?",
      [parent.id]
    );
    if ((countRows as any[])[0]?.cnt > 0) {
      return { ok: false, message: "Remove all linked students before removing this user" };
    }
    await pool.query("DELETE FROM parents WHERE id = ?", [parent.id]);
  }

  await pool.query("DELETE FROM staff_details WHERE user_id = ?", [userId]);
  await pool.query("DELETE FROM teacher_classes WHERE teacher_id = ?", [userId]);
  await pool.query("UPDATE students SET user_id = NULL WHERE user_id = ?", [userId]);

  return { ok: true };
};

/* ============================================================
   GET ALL CLASSES
   ============================================================ */
router.get("/classes", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  try {
    const params: any[] = [];
    let where = "";
    if (!isPlatformWide(req)) {
      where = "WHERE c.school_id = ?";
      params.push(req.user!.schoolId);
    }

    const [rows] = await pool.query(
      `SELECT
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
       ORDER BY c.id DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Error loading classes:", err);
    res.status(500).json({ message: "Failed to load classes" });
  }
});

/* ============================================================
   CREATE CLASS
   ============================================================ */
router.post("/classes", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const { class_name, year_group, description, class_code } = req.body;
  const schoolId = isPlatformWide(req) ? req.body.school_id : req.user!.schoolId;

  if (!class_name)
    return res.status(400).json({ message: "Class name required" });
  if (!class_code || !String(class_code).trim())
    return res.status(400).json({ message: "Class code required" });
  if (!schoolId)
    return res.status(400).json({ message: "School is required" });

  try {
    const schoolCode = await getSchoolCode(schoolId);
    if (!schoolCode) {
      return res.status(400).json({ message: "School not found" });
    }
    const fullClassCode = buildClassCode(schoolCode, String(class_code));

    await pool.query(
      `INSERT INTO classes (school_id, class_name, class_code, year_group, description)
       VALUES (?, ?, ?, ?, ?)`,
      [schoolId, class_name, fullClassCode, year_group || null, description || null]
    );

    res.json({ message: "Class created", class_code: fullClassCode });
  } catch (err: any) {
    console.error("Error creating class:", err);
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A class with this code already exists for this school" });
    }
    res.status(500).json({ message: "Failed to create class" });
  }
});

/* ============================================================
   UPDATE CLASS DETAILS
   ============================================================ */
router.put("/classes/:id", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const classId = req.params.id;
  const { class_name, year_group, description, class_code } = req.body;

  if (!class_name)
    return res.status(400).json({ message: "Class name required" });
  if (!class_code || !String(class_code).trim())
    return res.status(400).json({ message: "Class code required" });

  try {
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
      return res.status(404).json({ message: "Class not found" });
    }

    const schoolCode = await getSchoolCode(classSchoolId);
    if (!schoolCode) {
      return res.status(400).json({ message: "School not found" });
    }
    const fullClassCode = buildClassCode(schoolCode, String(class_code));

    await pool.query(
      `UPDATE classes
       SET class_name = ?, class_code = ?, year_group = ?, description = ?
       WHERE id = ?`,
      [class_name, fullClassCode, year_group || null, description || null, classId]
    );

    res.json({ message: "Class updated", class_code: fullClassCode });
  } catch (err: any) {
    console.error("Error updating class:", err);
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A class with this code already exists for this school" });
    }
    res.status(500).json({ message: "Failed to update class" });
  }
});

/* ============================================================
   DELETE CLASS (CLEAN UP RELATIONS FIRST)
   ============================================================ */
router.delete("/classes/:id", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const classId = req.params.id;

  try {
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
      return res.status(404).json({ message: "Class not found" });
    }

    await pool.query("DELETE FROM teacher_classes WHERE class_id = ?", [classId]);
    await pool.query("DELETE FROM student_classes WHERE class_id = ?", [classId]);
    await pool.query("DELETE FROM classes WHERE id = ?", [classId]);

    res.json({ message: "Class deleted" });
  } catch (err) {
    console.error("Delete class error:", err);
    res.status(500).json({ message: "Failed to delete class" });
  }
});

/* ============================================================
   ASSIGN TEACHER TO CLASS
   ============================================================ */
router.post("/classes/:id/assign-teacher", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const classId = req.params.id;
  const { teacherUserId } = req.body;

  if (!teacherUserId)
    return res.status(400).json({ message: "Teacher ID required" });

  try {
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
      return res.status(404).json({ message: "Class not found" });
    }
    const teacherSchoolId = await getUserSchoolId(teacherUserId);
    if (teacherSchoolId === null || teacherSchoolId !== classSchoolId) {
      return res.status(400).json({ message: "Teacher does not belong to this class's school" });
    }

    await pool.query(
      `INSERT INTO teacher_classes (teacher_id, class_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE teacher_id = teacher_id`,
      [teacherUserId, classId]
    );

    res.json({ message: "Teacher assigned" });
  } catch (err) {
    console.error("Error assigning teacher:", err);
    res.status(500).json({ message: "Failed to assign teacher" });
  }
});

/* ============================================================
   REMOVE TEACHER FROM CLASS
   ============================================================ */
router.post("/classes/:id/remove-teacher", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const classId = req.params.id;
  const { teacherUserId } = req.body;

  if (!teacherUserId)
    return res.status(400).json({ message: "Teacher ID required" });

  try {
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
      return res.status(404).json({ message: "Class not found" });
    }

    await pool.query(
      `DELETE FROM teacher_classes
       WHERE teacher_id = ? AND class_id = ?`,
      [teacherUserId, classId]
    );

    res.json({ message: "Teacher removed from class" });
  } catch (err) {
    console.error("Error removing teacher:", err);
    res.status(500).json({ message: "Failed to remove teacher" });
  }
});

/* ============================================================
   ASSIGN STUDENT TO CLASS
   ============================================================ */
router.post("/classes/:id/assign-student", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const classId = req.params.id;
  const { studentId } = req.body;

  if (!studentId)
    return res.status(400).json({ message: "Student ID required" });

  try {
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
      return res.status(404).json({ message: "Class not found" });
    }
    const studentSchoolId = await getStudentSchoolId(studentId);
    if (studentSchoolId === null || studentSchoolId !== classSchoolId) {
      return res.status(400).json({ message: "Student does not belong to this class's school" });
    }

    await pool.query(
      `INSERT INTO student_classes (student_id, class_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE student_id = student_id`,
      [studentId, classId]
    );

    res.json({ message: "Student assigned to class" });
  } catch (err) {
    console.error("Error assigning student:", err);
    res.status(500).json({ message: "Failed to assign student" });
  }
});

/* ============================================================
   REMOVE STUDENT FROM CLASS
   ============================================================ */
router.post("/classes/:id/remove-student", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const classId = req.params.id;
  const { studentId } = req.body;

  if (!studentId)
    return res.status(400).json({ message: "Student ID required" });

  try {
    const classSchoolId = await getClassSchoolId(classId);
    if (classSchoolId === null || !inRequesterScope(req, classSchoolId)) {
      return res.status(404).json({ message: "Class not found" });
    }

    await pool.query(
      `DELETE FROM student_classes
       WHERE student_id = ? AND class_id = ?`,
      [studentId, classId]
    );

    res.json({ message: "Student removed from class" });
  } catch (err) {
    console.error("Error removing student:", err);
    res.status(500).json({ message: "Failed to remove student" });
  }
});

/* ============================================================
   GET ALL TEACHERS + THEIR ASSIGNED CLASSES
   ============================================================ */
router.get("/teachers", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  try {
    const params: any[] = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
      schoolFilter = "AND u.school_id = ?";
      params.push(req.user!.schoolId);
    }

    const [rows] = await pool.query(
      `SELECT
         u.id AS teacher_id,
         u.username,
         u.email,
         c.id AS class_id,
         c.class_name,
         c.year_group
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN teacher_classes tc ON tc.teacher_id = u.id
       LEFT JOIN classes c ON c.id = tc.class_id
       WHERE r.name = 'teacher' ${schoolFilter}
       ORDER BY u.id ASC`,
      params
    );

    const results = rows as any[];
    const teachersMap: any = {};

    results.forEach((row: any) => {
      if (!teachersMap[row.teacher_id]) {
        teachersMap[row.teacher_id] = {
          id: row.teacher_id,
          username: row.username,
          email: row.email,
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
  } catch (err) {
    console.error("Error loading teachers:", err);
    res.status(500).json({ message: "Failed to load teachers" });
  }
});

/* ============================================================
   DELETE TEACHER (OPTIONAL, USED BY UI)
   ============================================================ */
router.delete("/teachers/:id", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const teacherId = Number(req.params.id);

  try {
    const teacherSchoolId = await getUserSchoolId(teacherId);
    if (teacherSchoolId === null || !inRequesterScope(req, teacherSchoolId)) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const cleanup = await detachUserDependencies(teacherId);
    if (!cleanup.ok) {
      return res.status(400).json({ message: cleanup.message });
    }

    await pool.query("DELETE FROM users WHERE id = ?", [teacherId]);

    res.json({ message: "Teacher removed" });
  } catch (err) {
    console.error("Delete teacher error:", err);
    res.status(500).json({ message: "Failed to delete teacher" });
  }
});

/* ============================================================
   STUDENTS + PARENTS OVERVIEW
   ============================================================ */
router.get("/students-parents", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  try {
    const params: any[] = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
      schoolFilter = "WHERE s.school_id = ?";
      params.push(req.user!.schoolId);
    }

    const [rows] = await pool.query(
      `SELECT
         s.id AS student_id,
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

         p.id AS parent_id,
         p.first_name AS parent_first_name,
         p.middle_name AS parent_middle_name,
         p.surname AS parent_last_name,
         p.relationship_to_student AS parent_relationship,
         p.contact_number AS parent_contact_number,
         p.email AS parent_email,
         p.medical_condition AS parent_medical_condition,
         p.address1 AS parent_address1,
         p.address2 AS parent_address2,
         p.address3 AS parent_address3,
         p.city AS parent_city,
         p.postcode AS parent_postcode,

         c.id AS class_id,
         c.class_name AS class_name

       FROM students s
       JOIN parents p ON s.parent_id = p.id
       LEFT JOIN student_classes a ON a.student_id = s.id
       LEFT JOIN classes c ON c.id = a.class_id
       ${schoolFilter}
       ORDER BY s.id DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Error loading student/parent overview:", err);
    res.status(500).json({ message: "Failed to load student/parent overview" });
  }
});

/* ============================================================
   ALL PARENTS (INCLUDING THOSE WITH NO STUDENTS LEFT)
   students-parents above is an inner join from students, so a parent
   whose last child was removed drops out of it entirely — this endpoint
   exists so Remove Users can still find and remove that parent.
   ============================================================ */
router.get("/parents", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  try {
    const params: any[] = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
      schoolFilter = "WHERE p.school_id = ?";
      params.push(req.user!.schoolId);
    }

    const [rows] = await pool.query(
      `SELECT
         p.id AS parent_id,
         p.first_name AS parent_first_name,
         p.surname AS parent_last_name,
         p.contact_number AS parent_contact_number,
         p.email AS parent_email,
         COUNT(s.id) AS student_count
       FROM parents p
       LEFT JOIN students s ON s.parent_id = p.id
       ${schoolFilter}
       GROUP BY p.id
       ORDER BY p.surname ASC, p.first_name ASC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Error loading parents:", err);
    res.status(500).json({ message: "Failed to load parents" });
  }
});

/* ============================================================
   STUDENTS ASSIGNED TO CLASSES (FOR UI TABLE)
   ============================================================ */
router.get("/assigned-students", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  try {
    const params: any[] = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
      schoolFilter = "WHERE c.school_id = ?";
      params.push(req.user!.schoolId);
    }

    const [rows] = await pool.query(
      `SELECT
         sc.class_id,
         c.class_name,
         s.id AS student_id,
         s.first_name AS student_first_name,
         s.surname AS student_last_name
       FROM student_classes sc
       JOIN classes c ON c.id = sc.class_id
       JOIN students s ON s.id = sc.student_id
       ${schoolFilter}
       ORDER BY c.class_name ASC, s.first_name ASC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Error loading assigned students:", err);
    res.status(500).json({ message: "Failed to load assigned students" });
  }
});

/* ============================================================
   GET ALL USERS WITH FULL DETAILS (strict SQL mode safe)
   Option C — Parent-only student display
   ============================================================ */
router.get("/users-all", authMiddleware, USER_MGMT, async (req: AuthenticatedRequest, res) => {
  try {
    const params: any[] = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
      schoolFilter = "WHERE u.school_id = ?";
      params.push(req.user!.schoolId);
    }

    const [rows] = await pool.query<any[]>(
      `
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
      LEFT JOIN students st ON st.parent_id = p.id

      ${schoolFilter}
      GROUP BY u.id
      ORDER BY u.username ASC
      `,
      params
    );

    const normalized = rows.map((u: any) => {
      let students = [];

      try {
        students = JSON.parse(u.students || "[]").filter(Boolean);
      } catch {
        students = [];
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

  } catch (err) {
    console.error("Error loading all users:", err);
    res.status(500).json({ message: "Failed to load users" });
  }
});

/* ============================================================
   GET PENDING USERS (WITH REQUESTED ROLE + BASIC DETAILS)
   ============================================================ */
router.get("/pending-users", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  try {
    const params: any[] = [];
    let schoolFilter = "";
    if (!isPlatformWide(req)) {
      schoolFilter = "AND u.school_id = ?";
      params.push(req.user!.schoolId);
    }

    const [rows] = await pool.query(
      `SELECT
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
       ORDER BY u.id ASC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("Error loading pending users:", err);
    res.status(500).json({ message: "Failed to load pending users" });
  }
});

/* ============================================================
   APPROVE USER
   ============================================================ */
router.post(
  "/approve/:id",
  authMiddleware,
  STAFF_MGMT,
  async (req: AuthenticatedRequest, res) => {
    const userId = req.params.id;
    const { role } = req.body;

    if (!role) return res.status(400).json({ message: "Role required" });

    // Admins may only grant roles up to their own privilege level — never owner/maintainer/system_admin
    if (req.user!.role === "admin" && ["owner", "maintainer", "system_admin"].includes(role)) {
      return res.status(403).json({ message: "Admins cannot grant owner, maintainer, or system admin roles" });
    }

    // Owners sit below system_admin — they cannot grant system_admin
    if (req.user!.role === "owner" && role === "system_admin") {
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

    const [roleRows] = await pool.query(
      "SELECT id FROM roles WHERE name = ?",
      [role]
    );

    const roleId = (roleRows as any)[0]?.id;
    if (!roleId) return res.status(400).json({ message: "Invalid role" });

    await pool.query(
      "UPDATE users SET role_id = ?, requested_role = NULL WHERE id = ?",
      [roleId, userId]
    );

    res.json({ message: "User approved" });
  }
);

/* ============================================================
   REJECT USER
   ============================================================ */
router.post("/reject/:id", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const userId = req.params.id;

  try {
    const targetSchoolId = await getUserSchoolId(userId);
    if (targetSchoolId === null || !inRequesterScope(req, targetSchoolId)) {
      return res.status(404).json({ message: "User not found" });
    }

    if (isPlatformWide(req) && (await getUserRequestedRole(userId)) === "parent") {
      return res.status(403).json({ message: "System admins cannot reject parent registrations — this must be done by the school's admin or owner" });
    }

    // Pending registrations aren't real enrollments yet, so rejecting one
    // wipes the whole submission — including any children submitted with
    // it — rather than the "keep enrolled students" rule used for already
    // -approved parents.
    const [parentRows] = await pool.query("SELECT id FROM parents WHERE user_id = ?", [userId]);
    const parent = (parentRows as any[])[0];

    if (parent) {
      await pool.query("DELETE FROM students WHERE parent_id = ?", [parent.id]);
      await pool.query("DELETE FROM parents WHERE id = ?", [parent.id]);
    }

    await pool.query("DELETE FROM staff_details WHERE user_id = ?", [userId]);
    await pool.query("DELETE FROM users WHERE id = ?", [userId]);

    res.json({ message: "User rejected" });
  } catch (err) {
    console.error("Reject user error:", err);
    res.status(500).json({ message: "Failed to reject user" });
  }
});

/* ============================================================
   REMOVE STUDENT (FIRST)
   ============================================================ */
router.delete("/remove-student/:id", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const studentId = req.params.id;

  try {
    const studentSchoolId = await getStudentSchoolId(studentId);
    if (studentSchoolId === null || !inRequesterScope(req, studentSchoolId)) {
      return res.status(404).json({ message: "Student not found" });
    }

    await pool.query("DELETE FROM student_classes WHERE student_id = ?", [studentId]);
    await pool.query("DELETE FROM students WHERE id = ?", [studentId]);

    res.json({ message: "Student removed" });
  } catch (err) {
    console.error("Remove student error:", err);
    res.status(500).json({ message: "Failed to remove student" });
  }
});

/* ============================================================
   REMOVE PARENT (ONLY IF NO STUDENTS)
   ============================================================ */
router.delete("/remove-parent/:id", authMiddleware, STAFF_MGMT, async (req: AuthenticatedRequest, res) => {
  const parentId = req.params.id;

  try {
    const parentSchoolId = await getParentSchoolId(parentId);
    if (parentSchoolId === null || !inRequesterScope(req, parentSchoolId)) {
      return res.status(404).json({ message: "Parent not found" });
    }

    const [rows] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM students WHERE parent_id = ?",
      [parentId]
    );
    const count = (rows as any)[0]?.cnt || 0;

    if (count > 0) {
      return res
        .status(400)
        .json({ message: "Remove all linked students before removing this parent" });
    }

    const [parentRows] = await pool.query("SELECT user_id FROM parents WHERE id = ?", [parentId]);
    const userId = (parentRows as any[])[0]?.user_id;

    await pool.query("DELETE FROM parents WHERE id = ?", [parentId]);

    // Also remove the login itself — otherwise a "removed" parent can
    // still sign in afterward.
    if (userId) {
      await pool.query("DELETE FROM users WHERE id = ?", [userId]);
    }

    res.json({ message: "Parent removed" });
  } catch (err) {
    console.error("Remove parent error:", err);
    res.status(500).json({ message: "Failed to remove parent" });
  }
});

/* ============================================================
   GET ALL ROLES
   ============================================================ */
router.get(
  "/roles",
  authMiddleware,
  requireRole("admin", "owner", "maintainer", "system_admin"),
  async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name FROM roles ORDER BY name ASC");
    res.json(rows);
  } catch (err) {
    console.error("Error loading roles:", err);
    res.status(500).json({ message: "Failed to load roles" });
  }
});

/* ============================================================
   ADD NEW ROLE
   ============================================================ */
router.post(
  "/roles/add",
  authMiddleware,
  requireRole("owner", "maintainer", "system_admin"),
  async (req, res) => {
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

    try {
      const [existing] = await pool.query("SELECT id FROM roles WHERE name = ?", [name]);

      if ((existing as any[]).length > 0) {
        return res.status(200).json({ success: false, message: "A role with this name already exists" });
      }

      await pool.query("INSERT INTO roles (name) VALUES (?)", [name]);

      res.json({ success: true, message: "Role added successfully" });
    } catch (err) {
      console.error("Error adding role:", err);
      res.status(500).json({ message: "Failed to add role" });
    }
  }
);

/* ============================================================
   DELETE USER (NEW)
   ============================================================ */
router.delete("/users/:id", authMiddleware, USER_MGMT, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = Number(req.params.id);

    // Prevent deleting the system owner or a system admin
    const [rows] = await pool.query(
      `SELECT r.name AS role, u.school_id
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [userId]
    );

    const user = (rows as any)[0];
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
    await pool.query("DELETE FROM users WHERE id = ?", [userId]);

    res.json({ message: "User deleted" });

  } catch (err) {
    console.error("User delete error:", err);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

/* ============================================================
   UPDATE USER DETAILS (parent or staff profile fields)
   ============================================================ */
router.put(
  "/users/:id/update-details",
  authMiddleware,
  USER_MGMT,
  async (req: AuthenticatedRequest, res) => {
    const userId = Number(req.params.id);
    const {
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
      email
    } = req.body;

    try {
      const [roleRows] = await pool.query(
        `SELECT r.name AS role, u.school_id
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = ?`,
        [userId]
      );
      const targetUser = (roleRows as any[])[0];
      const role = targetUser?.role;

      if (!role || !inRequesterScope(req, targetUser.school_id)) {
        return res.status(404).json({ message: "User not found" });
      }

      if (role === "parent") {
        const [existing] = await pool.query(
          "SELECT id FROM parents WHERE user_id = ?",
          [userId]
        );

        if ((existing as any[]).length > 0) {
          await pool.query(
            `UPDATE parents
             SET first_name = ?, middle_name = ?, surname = ?, date_of_birth = ?,
                 address1 = ?, address2 = ?, address3 = ?, city = ?, postcode = ?,
                 medical_condition = ?, email = ?
             WHERE user_id = ?`,
            [
              first_name || null, middle_name || null, last_name || null, date_of_birth || null,
              address1 || null, address2 || null, address3 || null, city || null, postcode || null,
              medical_condition || null, email || null, userId
            ]
          );
        } else {
          await pool.query(
            `INSERT INTO parents
               (user_id, first_name, middle_name, surname, date_of_birth,
                address1, address2, address3, city, postcode, medical_condition, email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId, first_name || null, middle_name || null, last_name || null, date_of_birth || null,
              address1 || null, address2 || null, address3 || null, city || null, postcode || null,
              medical_condition || null, email || null
            ]
          );
        }
      } else if (["teacher", "admin", "maintainer", "owner", "staff", "system_admin"].includes(role)) {
        const [existing] = await pool.query(
          "SELECT id FROM staff_details WHERE user_id = ?",
          [userId]
        );

        if ((existing as any[]).length > 0) {
          await pool.query(
            `UPDATE staff_details
             SET first_name = ?, middle_name = ?, surname = ?, date_of_birth = ?,
                 address1 = ?, address2 = ?, address3 = ?, city = ?, postcode = ?,
                 medical_condition = ?, disability = ?, email = ?
             WHERE user_id = ?`,
            [
              first_name || null, middle_name || null, last_name || null, date_of_birth || null,
              address1 || null, address2 || null, address3 || null, city || null, postcode || null,
              medical_condition || null, disability || null, email || null, userId
            ]
          );
        } else {
          await pool.query(
            `INSERT INTO staff_details
               (user_id, first_name, middle_name, surname, date_of_birth,
                address1, address2, address3, city, postcode, medical_condition, disability, email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId, first_name || null, middle_name || null, last_name || null, date_of_birth || null,
              address1 || null, address2 || null, address3 || null, city || null, postcode || null,
              medical_condition || null, disability || null, email || null
            ]
          );
        }
      } else {
        return res.status(400).json({ message: "This user's role does not support detail editing" });
      }

      // Keep the login-lookup email in sync with the profile email
      if (email) {
        await pool.query("UPDATE users SET email = ? WHERE id = ?", [email, userId]);
      }

      res.json({ message: "User details updated" });
    } catch (err: any) {
      console.error("Update user details error:", err);
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Another account already uses this email" });
      }
      res.status(500).json({ message: "Failed to update user details" });
    }
  }
);

/* ============================================================
   DOWNLOAD ATTENDANCE REPORT (CSV) — ADMIN / OWNER
   Filters: optional classId (defaults to all classes) and an optional
   date range, which cannot reach further back than 365 days.
   ============================================================ */
router.get("/attendance/report", authMiddleware, REPORT_ROLES, async (req: AuthenticatedRequest, res) => {
  try {
    if (!(await isFeatureEnabled("attendance_report", req.user!.schoolId))) {
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

    const params: any[] = [startDate, endDate];
    let classFilter = "";
    if (classId) {
      classFilter = "AND a.class_id = ?";
      params.push(classId);
    } else {
      classFilter = "AND c.school_id = ?";
      params.push(req.user!.schoolId);
    }

    const [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(a.date, '%Y-%m-%d') AS date,
         s.first_name,
         s.surname,
         c.class_name,
         a.status
       FROM attendance a
       JOIN students s ON s.id = a.student_id
       JOIN classes c ON c.id = a.class_id
       WHERE a.date BETWEEN ? AND ? ${classFilter}
       ORDER BY c.class_name ASC, a.date ASC, s.first_name ASC, s.surname ASC`,
      params
    );

    const csv = toCsv(
      ["Date", "First Name", "Last Name", "Class", "Attendance"],
      (rows as any[]).map(r => [
        r.date,
        r.first_name,
        r.surname,
        r.class_name,
        r.status === "PRESENT" ? "Present" : "Absent"
      ])
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="attendance_report_${startDate}_to_${endDate}.csv"`
    );
    res.send(csv);
  } catch (err) {
    console.error("Admin attendance report error:", err);
    res.status(500).json({ message: "Failed to generate attendance report" });
  }
});

export default router;
