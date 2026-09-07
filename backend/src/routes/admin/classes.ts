import { Hono } from "hono";
import type { AppEnv } from "../../types/env";
import { authMiddleware } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import {
  STAFF_MGMT,
  isPlatformWide,
  inRequesterScope,
  getClassSchoolId,
  getSchoolCode,
  buildClassCode,
  getUserSchoolId,
  getStudentSchoolId
} from "./shared";

const router = new Hono<AppEnv>();

/* ============================================================
   GET ALL CLASSES
   ============================================================ */
router.get("/classes", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const params: any[] = [];
  let where = "";
  if (!isPlatformWide(user)) {
    where = "WHERE c.school_id = $1";
    params.push(user.schoolId);
  }

  const { rows } = await db.query(
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

  return c.json(rows);
});

/* ============================================================
   CREATE CLASS
   ============================================================ */
router.post("/classes", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const body = await c.req.json();
  const { class_name, year_group, description, class_code } = body;
  const schoolId = isPlatformWide(user) ? body.school_id : user.schoolId;

  if (!class_name) return c.json({ message: "Class name required" }, 400);
  if (!class_code || !String(class_code).trim()) return c.json({ message: "Class code required" }, 400);
  if (!schoolId) return c.json({ message: "School is required" }, 400);

  const schoolCode = await getSchoolCode(db, schoolId);
  if (!schoolCode) {
    return c.json({ message: "School not found" }, 400);
  }
  const fullClassCode = buildClassCode(schoolCode, String(class_code));

  try {
    await db.query(
      `INSERT INTO classes (school_id, class_name, class_code, year_group, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [schoolId, class_name, fullClassCode, year_group || null, description || null]
    );
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new HttpError(409, "A class with this code already exists for this school");
    }
    throw err;
  }

  return c.json({ message: "Class created", class_code: fullClassCode });
});

/* ============================================================
   UPDATE CLASS DETAILS
   ============================================================ */
router.put("/classes/:id", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = c.req.param("id")!;
  const { class_name, year_group, description, class_code } = await c.req.json();

  if (!class_name) return c.json({ message: "Class name required" }, 400);
  if (!class_code || !String(class_code).trim()) return c.json({ message: "Class code required" }, 400);

  const classSchoolId = await getClassSchoolId(db, classId);
  if (classSchoolId === null || !inRequesterScope(user, classSchoolId)) {
    return c.json({ message: "Class not found" }, 404);
  }

  const schoolCode = await getSchoolCode(db, classSchoolId);
  if (!schoolCode) {
    return c.json({ message: "School not found" }, 400);
  }
  const fullClassCode = buildClassCode(schoolCode, String(class_code));

  try {
    await db.query(
      `UPDATE classes
       SET class_name = $1, class_code = $2, year_group = $3, description = $4
       WHERE id = $5`,
      [class_name, fullClassCode, year_group || null, description || null, classId]
    );
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new HttpError(409, "A class with this code already exists for this school");
    }
    throw err;
  }

  return c.json({ message: "Class updated", class_code: fullClassCode });
});

/* ============================================================
   DELETE CLASS (CLEAN UP RELATIONS FIRST)
   ============================================================ */
router.delete("/classes/:id", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = c.req.param("id")!;

  const classSchoolId = await getClassSchoolId(db, classId);
  if (classSchoolId === null || !inRequesterScope(user, classSchoolId)) {
    return c.json({ message: "Class not found" }, 404);
  }

  await db.query("DELETE FROM teacher_classes WHERE class_id = $1", [classId]);
  await db.query("DELETE FROM student_classes WHERE class_id = $1", [classId]);
  await db.query("DELETE FROM classes WHERE id = $1", [classId]);

  return c.json({ message: "Class deleted" });
});

/* ============================================================
   ASSIGN TEACHER TO CLASS
   ============================================================ */
router.post("/classes/:id/assign-teacher", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = c.req.param("id")!;
  const { teacherUserId } = await c.req.json();

  if (!teacherUserId) return c.json({ message: "Teacher ID required" }, 400);

  const classSchoolId = await getClassSchoolId(db, classId);
  if (classSchoolId === null || !inRequesterScope(user, classSchoolId)) {
    return c.json({ message: "Class not found" }, 404);
  }
  const teacherSchoolId = await getUserSchoolId(db, teacherUserId);
  if (teacherSchoolId === null || teacherSchoolId !== classSchoolId) {
    return c.json({ message: "Teacher does not belong to this class's school" }, 400);
  }

  await db.query(
    `INSERT INTO teacher_classes (teacher_id, class_id)
     VALUES ($1, $2)
     ON CONFLICT (teacher_id, class_id) DO NOTHING`,
    [teacherUserId, classId]
  );

  return c.json({ message: "Teacher assigned" });
});

/* ============================================================
   REMOVE TEACHER FROM CLASS
   ============================================================ */
router.post("/classes/:id/remove-teacher", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = c.req.param("id")!;
  const { teacherUserId } = await c.req.json();

  if (!teacherUserId) return c.json({ message: "Teacher ID required" }, 400);

  const classSchoolId = await getClassSchoolId(db, classId);
  if (classSchoolId === null || !inRequesterScope(user, classSchoolId)) {
    return c.json({ message: "Class not found" }, 404);
  }

  await db.query(
    `DELETE FROM teacher_classes
     WHERE teacher_id = $1 AND class_id = $2`,
    [teacherUserId, classId]
  );

  return c.json({ message: "Teacher removed from class" });
});

/* ============================================================
   ASSIGN STUDENT TO CLASS
   ============================================================ */
router.post("/classes/:id/assign-student", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = c.req.param("id")!;
  const { studentId } = await c.req.json();

  if (!studentId) return c.json({ message: "Student ID required" }, 400);

  const classSchoolId = await getClassSchoolId(db, classId);
  if (classSchoolId === null || !inRequesterScope(user, classSchoolId)) {
    return c.json({ message: "Class not found" }, 404);
  }
  const studentSchoolId = await getStudentSchoolId(db, studentId);
  if (studentSchoolId === null || studentSchoolId !== classSchoolId) {
    return c.json({ message: "Student does not belong to this class's school" }, 400);
  }

  await db.query(
    `INSERT INTO student_classes (student_id, class_id)
     VALUES ($1, $2)
     ON CONFLICT (student_id, class_id) DO NOTHING`,
    [studentId, classId]
  );

  return c.json({ message: "Student assigned to class" });
});

/* ============================================================
   REMOVE STUDENT FROM CLASS
   ============================================================ */
router.post("/classes/:id/remove-student", authMiddleware, STAFF_MGMT, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const classId = c.req.param("id")!;
  const { studentId } = await c.req.json();

  if (!studentId) return c.json({ message: "Student ID required" }, 400);

  const classSchoolId = await getClassSchoolId(db, classId);
  if (classSchoolId === null || !inRequesterScope(user, classSchoolId)) {
    return c.json({ message: "Class not found" }, 404);
  }

  await db.query(
    `DELETE FROM student_classes
     WHERE student_id = $1 AND class_id = $2`,
    [studentId, classId]
  );

  return c.json({ message: "Student removed from class" });
});


export default router;
