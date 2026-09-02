import bcrypt from "bcryptjs";
import { generateUniqueUsername } from "./studentUsername";
import { generateTemporaryPassword } from "./tempPassword";

interface CreateStudentLoginParams {
  studentId: number;
  firstName: string;
  surname: string;
  schoolId: number;
  studentRoleId: number;
}

interface StudentLoginResult {
  username: string;
  temporaryPassword: string;
}

// Provisions a login for an already-existing `students` row — called from
// parent-approval, CSV bulk-upload, and the admin-triggered backfill
// endpoint. Students never set their own password (there's no student-facing
// registration form), so this always starts them in the same
// must-reset-password state a password reset would, and the caller is
// responsible for relaying the one-time password out of band.
export const createStudentLogin = async (conn: any, params: CreateStudentLoginParams): Promise<StudentLoginResult> => {
  const { studentId, firstName, surname, schoolId, studentRoleId } = params;

  const username = await generateUniqueUsername(conn, firstName, surname);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const [userResult] = await conn.query(
    `INSERT INTO users (username, email, password_hash, role_id, school_id, must_reset_password)
     VALUES (?, NULL, ?, ?, ?, TRUE)`,
    [username, passwordHash, studentRoleId, schoolId]
  );
  const userId = (userResult as any).insertId;

  await conn.query("UPDATE students SET user_id = ? WHERE id = ?", [userId, studentId]);

  return { username, temporaryPassword };
};
