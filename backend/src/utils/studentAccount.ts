import bcrypt from "bcryptjs";
import type { DbConnection } from "../config/db";
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

interface IdRow {
  id: number;
}

// Provisions a login for an already-existing `students` row — called from
// parent-approval, CSV bulk-upload, and the admin-triggered backfill
// endpoint. Students never set their own password (there's no student-facing
// registration form), so this always starts them in the same
// must-reset-password state a password reset would, and the caller is
// responsible for relaying the one-time password out of band.
export const createStudentLogin = async (
  conn: DbConnection,
  params: CreateStudentLoginParams
): Promise<StudentLoginResult> => {
  const { studentId, firstName, surname, schoolId, studentRoleId } = params;

  const username = await generateUniqueUsername(conn, firstName, surname);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const {
    rows: [userResult]
  } = await conn.query<IdRow>(
    `INSERT INTO users (username, email, password_hash, role_id, school_id, must_reset_password)
     VALUES ($1, NULL, $2, $3, $4, TRUE)
     RETURNING id`,
    [username, passwordHash, studentRoleId, schoolId]
  );
  const userId = userResult.id;

  await conn.query("UPDATE students SET user_id = $1 WHERE id = $2", [userId, studentId]);

  return { username, temporaryPassword };
};
