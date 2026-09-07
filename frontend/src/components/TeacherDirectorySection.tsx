import React, { useContext, useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import SearchSort from "./SearchSort";
import Pagination from "./Pagination";
import { useConfirm } from "./ConfirmDialog";
import { getErrorMessage } from "../utils/getErrorMessage";
import { useClassManagement } from "../hooks/useClassManagement";
import { AuthContext } from "../AuthContext";

const PAGE_SIZE = 5;

// Only the fields this section's "Assign Teacher to Class" dropdown reads —
// GET /admin/classes returns much more, not needed here.
interface ClassOption {
  id: number;
  class_name: string | null;
}

interface TeacherClassAssignment {
  id: number;
  class_name: string | null;
  year_group: string | null;
}

interface TeacherItem {
  id: number;
  username: string;
  email: string | null;
  first_name: string | null;
  surname: string | null;
  assigned_classes: TeacherClassAssignment[];
}

// Shared between AdminDashboard, OwnerDashboard, and SystemAdminDashboard —
// identical functionality across all three, so it lives here rather than
// being duplicated in each dashboard file (same reasoning as
// FeeTrackingSection / ClassManagementSection).
const TeacherDirectorySection: React.FC = () => {
  const { user } = useContext(AuthContext);
  const isSystemAdmin = user?.role === "system_admin";

  // Full, unpaginated list — feeds the "Select Teacher" dropdown below,
  // which needs every teacher in scope, not one page of them. Fetched
  // with no page/pageSize, same as every other dropdown consumer of this
  // endpoint (TimetableSection) — see /admin/teachers's own comment.
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  // The actual Teacher Directory table below — a separate, paginated
  // fetch of the same endpoint, since the dropdown above can't paginate
  // away its options.
  const [directoryTeachers, setDirectoryTeachers] = useState<TeacherItem[]>([]);
  const [totalTeachers, setTotalTeachers] = useState(0);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("az");
  const [page, setPage] = useState(0);

  const { confirm, ConfirmDialog } = useConfirm();

  const loadTeachers = async () => {
    try {
      const res = await api.get("/admin/teachers");
      setTeachers(res.data || []);
      setError(null);
    } catch (err) {
      console.error("Failed to load teachers", err);
      setError(getErrorMessage(err, "Failed to load teachers."));
    } finally {
      setLoading(false);
    }
  };

  const loadDirectoryTeachers = async () => {
    try {
      const res = await api.get("/admin/teachers", { params: { page, pageSize: PAGE_SIZE, search, sort } });
      setDirectoryTeachers(res.data.teachers || []);
      setTotalTeachers(res.data.total || 0);
    } catch (err) {
      console.error("Failed to load teacher directory", err);
      setError(getErrorMessage(err, "Failed to load teachers."));
    }
  };

  const loadClasses = async () => {
    try {
      const res = await api.get("/admin/classes");
      setClasses(res.data || []);
    } catch (err) {
      console.error("Failed to load classes", err);
    }
  };

  useEffect(() => {
    loadTeachers();
    loadClasses();
  }, []);

  useEffect(() => {
    loadDirectoryTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, sort]);

  // A mutation (assign/remove/delete) can change both the dropdown's full
  // list and the directory table's current page, so reload both.
  const reloadTeachers = async () => {
    await Promise.all([loadTeachers(), loadDirectoryTeachers()]);
  };

  const {
    assignClassId,
    setAssignClassId,
    assignTeacherId,
    setAssignTeacherId,
    assignTeacher,
    handleRemoveTeacher,
    handleDeleteTeacher
  } = useClassManagement({ reload: reloadTeachers, setLoadError: setError, setSuccessMessage: setSuccess, confirm });

  // system_admin only — Admin/Owner reset teacher passwords from
  // PasswordManagementSection instead; this button only shows for
  // system_admin, which has no such section (see
  // frontend/src/components/OwnerPasswordResetSection.tsx's comment for
  // the equivalent split on the owner side).
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

  if (loading) return <p style={styles.text}>Loading teachers…</p>;

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
        <h3 style={{ marginBottom: 16 }}>Assign Teacher to Class</h3>

        <form
          onSubmit={assignTeacher}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 500
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>
              Select Class
            </label>
            <select
              value={assignClassId}
              onChange={e => setAssignClassId(e.target.value)}
              style={styles.input}
            >
              <option value="">Choose a class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.class_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>
              Select Teacher
            </label>
            <select
              value={assignTeacherId}
              onChange={e => setAssignTeacherId(e.target.value)}
              style={styles.input}
            >
              <option value="">Choose a teacher</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.username}
                </option>
              ))}
            </select>
          </div>

          <button style={{ ...styles.actionBtn, marginTop: 8 }}>
            Assign Teacher
          </button>
        </form>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Teacher Directory</h3>

        <SearchSort search={search} onSearch={setSearch} sort={sort} onSort={setSort} />

        <div style={{ overflowX: "auto" }}>
        <table style={{ ...styles.table, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Teacher</th>
              <th style={{ textAlign: "left" }}>Email</th>
              <th style={{ textAlign: "left" }}>Assigned Class</th>
              <th style={{ textAlign: "center", width: 120 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {directoryTeachers.map((t) => {
              const assigned = t.assigned_classes || [];

              if (assigned.length === 0) {
                return (
                  <tr key={t.id}>
                    <td>{t.username}</td>
                    <td>{t.email || "—"}</td>
                    <td>—</td>

                    <td style={{ textAlign: "center" }}>
                      {isSystemAdmin && (
                        <button
                          onClick={() => handleResetPassword(t.id, t.username)}
                          style={{ ...styles.secondaryBtn, marginRight: 6 }}
                        >
                          Reset Password
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteTeacher(t.id)}
                        style={{
                          background: "#dc2626",
                          color: "white",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 14
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              }

              return assigned.map((cls) => (
                <tr key={`${t.id}-${cls.id}`}>
                  <td>{t.username}</td>
                  <td>{t.email || "—"}</td>
                  <td>{cls.class_name}</td>

                  <td style={{ textAlign: "center" }}>
                    <button
                      onClick={() => handleRemoveTeacher(cls.id, t.id)}
                      style={{
                        background: "#dc2626",
                        color: "white",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 14
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
        </div>

        <Pagination page={page} setPage={setPage} pageSize={PAGE_SIZE} total={totalTeachers} />
      </div>
    </div>
  );
};

export default TeacherDirectorySection;
