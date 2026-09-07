import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import SearchSort from "./SearchSort";
import Pagination from "./Pagination";
import { useConfirm } from "./ConfirmDialog";
import { getErrorMessage } from "../utils/getErrorMessage";

const PAGE_SIZE = 5;

interface GuardianItem {
  parent_id: number;
  user_id: number | null;
  first_name: string | null;
  surname: string | null;
  contact_number: string | null;
}

interface StudentParentRow {
  student_id: number;
  student_first_name: string | null;
  student_last_name: string | null;
  guardians: GuardianItem[];
}

// system_admin only — substantially different from RemoveUsersSection.tsx
// (Admin/Owner): one combined "Remove Students & Parents" table rather
// than two separate ones, parent removal done inline per-guardian inside
// the student row (with its own per-guardian password reset button)
// instead of a dedicated parents table, and no "must have zero students
// first" gate before a parent can be removed.
const SystemAdminRemoveUsersSection: React.FC = () => {
  const [studentsParents, setStudentsParents] = useState<StudentParentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("az");
  const [page, setPage] = useState(0);

  const { confirm, ConfirmDialog } = useConfirm();

  // Server-side paginated/searched/sorted — see RemoveUsersSection's own
  // comment, this is the same students-parents table with a different
  // layout (one combined table, not split students/parents).
  const loadStudentsParents = async () => {
    try {
      const res = await api.get("/admin/students-parents", {
        params: { page, pageSize: PAGE_SIZE, search, sort }
      });
      setStudentsParents(res.data.studentsParents || []);
      setTotal(res.data.total || 0);
      setError(null);
    } catch (err) {
      console.error("Failed to load students/parents", err);
      setError(getErrorMessage(err, "Failed to load students and parents."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentsParents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, sort]);

  const handleRemoveStudent = async (studentId: number) => {
    if (!(await confirm("Remove this student permanently?"))) return;

    try {
      await api.delete(`/admin/remove-student/${studentId}`);
      await loadStudentsParents();
      setSuccess("Student removed successfully.");
    } catch (err) {
      console.error("Remove student error:", err);
      setError(getErrorMessage(err, "Failed to remove student"));
    }
  };

  const handleRemoveParent = async (parentId: number) => {
    if (!(await confirm("Remove this parent permanently?"))) return;

    try {
      await api.delete(`/admin/remove-parent/${parentId}`);
      await loadStudentsParents();
      setSuccess("Parent removed successfully.");
    } catch (err) {
      console.error("Remove parent error:", err);
      setError(getErrorMessage(err, "Failed to remove parent"));
    }
  };

  // Same endpoint TeacherDirectorySection's system_admin-only reset button
  // uses — this one resets a guardian (parent-role user), not a teacher.
  const handleResetPassword = async (userId: number, label: string) => {
    if (!(await confirm(`Reset ${label}'s password? A new one-time password will be generated.`))) return;

    try {
      const res = await api.post(`/admin/users/${userId}/reset-password`);
      setSuccess(
        `Password reset for ${label}. One-time password: ${res.data.temporaryPassword} — share this with them directly, it won't be shown again.`
      );
    } catch (err) {
      console.error("Reset password error:", err);
      setError(getErrorMessage(err, "Failed to reset password"));
    }
  };

  if (loading) return <p style={styles.text}>Loading students and parents…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {ConfirmDialog}

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", fontSize: 14 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", fontSize: 14 }}>
          {success}
        </div>
      )}

      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Remove Students & Parents</h3>

        <SearchSort search={search} onSearch={setSearch} sort={sort} onSort={setSort} />

        <div style={{ overflowX: "auto" }}>
          <table style={{ ...styles.table, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Student</th>
                <th style={{ textAlign: "left" }}>Parent</th>
                <th style={{ textAlign: "left" }}>Contact</th>
                <th style={{ textAlign: "center", width: 200 }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {studentsParents.map(row => (
                <tr key={row.student_id}>
                  <td>
                    <strong>
                      {row.student_first_name} {row.student_last_name}
                    </strong>
                  </td>

                  <td>
                    {(row.guardians || []).map(g => `${g.first_name} ${g.surname}`).join(", ") || "—"}
                  </td>

                  <td>
                    {(row.guardians || []).map(g => g.contact_number).filter(Boolean).join(", ") || "—"}
                  </td>

                  <td style={{ textAlign: "center" }}>
                    <button
                      onClick={() => handleRemoveStudent(row.student_id)}
                      style={{
                        background: "#26dc87",
                        color: "white",
                        border: "none",
                        padding: "6px 8px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 14,
                        marginRight: 8
                      }}
                    >
                      Remove Student
                    </button>

                    {(row.guardians || []).map(g => (
                      <React.Fragment key={g.parent_id}>
                        {g.user_id && (
                          <button
                            onClick={() => handleResetPassword(g.user_id!, `${g.first_name} ${g.surname}`)}
                            style={{ ...styles.secondaryBtn, marginRight: 4 }}
                          >
                            Reset {g.first_name}'s Password
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveParent(g.parent_id)}
                          style={{
                            background: "#b91c1c",
                            color: "white",
                            border: "none",
                            padding: "6px 8px",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 14,
                            marginRight: 4
                          }}
                        >
                          Remove {g.first_name}
                        </button>
                      </React.Fragment>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} setPage={setPage} pageSize={PAGE_SIZE} total={total} />
      </div>
    </div>
  );
};

export default SystemAdminRemoveUsersSection;
