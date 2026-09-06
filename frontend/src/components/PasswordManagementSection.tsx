import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";
import SearchSort from "./SearchSort";
import Pagination from "./Pagination";
import { useConfirm } from "./ConfirmDialog";

const PAGE_SIZE = 5;

interface TeacherItem {
  id: number;
  username: string;
  email: string | null;
}

interface ParentItem {
  parent_id: number;
  parent_user_id: number;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_email: string | null;
}

// Shared across every dashboard with a "Password Management" nav item
// (Admin, Owner, Maintainer, SystemAdmin) — a reset-password trigger for
// every teacher/parent who already has a login. Read-only lists here (no
// create/edit), so this duplicates classes/teachers/parents-shaped fetches
// other sections also make rather than sharing state — matches
// FeeTrackingSection's own independence-over-sharing approach.
const PasswordManagementSection: React.FC = () => {
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [totalTeachers, setTotalTeachers] = useState(0);
  const [parents, setParents] = useState<ParentItem[]>([]);
  const [totalParents, setTotalParents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchTeachers, setSearchTeachers] = useState("");
  const [sortTeachers, setSortTeachers] = useState("az");
  const [pageTeachers, setPageTeachers] = useState(0);
  const [searchParents, setSearchParents] = useState("");
  const [sortParents, setSortParents] = useState("az");
  const [pageParents, setPageParents] = useState(0);

  const { confirm, ConfirmDialog } = useConfirm();

  // Server-side paginated/searched/sorted — see AllUsersSection's own
  // comment, same reasoning applies to a school's teacher/parent count.
  // Two independent loads (not one combined fetch) so paging/searching one
  // table doesn't re-fetch the other.
  const loadTeachers = async () => {
    try {
      const res = await api.get("/admin/teachers", {
        params: { page: pageTeachers, pageSize: PAGE_SIZE, search: searchTeachers, sort: sortTeachers }
      });
      setTeachers(res.data.teachers || []);
      setTotalTeachers(res.data.total || 0);
      setError(null);
    } catch (err) {
      console.error("Failed to load teachers", err);
      setError(getErrorMessage(err, "Failed to load data."));
    } finally {
      setLoading(false);
    }
  };

  const loadParents = async () => {
    try {
      const res = await api.get("/admin/parents", {
        params: { page: pageParents, pageSize: PAGE_SIZE, search: searchParents, sort: sortParents, hasLogin: true }
      });
      setParents(res.data.parents || []);
      setTotalParents(res.data.total || 0);
      setError(null);
    } catch (err) {
      console.error("Failed to load parents", err);
      setError(getErrorMessage(err, "Failed to load data."));
    }
  };

  useEffect(() => {
    loadTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTeachers, searchTeachers, sortTeachers]);

  useEffect(() => {
    loadParents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageParents, searchParents, sortParents]);

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

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  if (loading) return <p style={styles.text}>Loading…</p>;

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
        <h3 style={{ marginBottom: 16 }}>Teachers</h3>

        <SearchSort search={searchTeachers} onSearch={setSearchTeachers} sort={sortTeachers} onSort={setSortTeachers} />

        <div style={{ overflowX: "auto" }}>
          <table style={{ ...styles.table, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Teacher</th>
                <th style={{ textAlign: "left" }}>Email</th>
                <th style={{ textAlign: "center", width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => (
                <tr key={t.id}>
                  <td>{t.username}</td>
                  <td>{t.email || "—"}</td>
                  <td style={{ textAlign: "center" }}>
                    <button onClick={() => handleResetPassword(t.id, t.username)} style={styles.secondaryBtn}>
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={pageTeachers} setPage={setPageTeachers} pageSize={PAGE_SIZE} total={totalTeachers} />
      </div>

      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Parents</h3>

        <SearchSort search={searchParents} onSearch={setSearchParents} sort={sortParents} onSort={setSortParents} />

        <div style={{ overflowX: "auto" }}>
          <table style={{ ...styles.table, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Parent</th>
                <th style={{ textAlign: "left" }}>Email</th>
                <th style={{ textAlign: "center", width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {parents.map(p => (
                <tr key={p.parent_id}>
                  <td>
                    {p.parent_first_name} {p.parent_last_name}
                  </td>
                  <td>{p.parent_email || "—"}</td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      onClick={() =>
                        handleResetPassword(p.parent_user_id, `${p.parent_first_name} ${p.parent_last_name}`)
                      }
                      style={styles.secondaryBtn}
                    >
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={pageParents} setPage={setPageParents} pageSize={PAGE_SIZE} total={totalParents} />
      </div>
    </div>
  );
};

export default PasswordManagementSection;
