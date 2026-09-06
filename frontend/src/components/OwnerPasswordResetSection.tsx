import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { useConfirm } from "./ConfirmDialog";
import { getErrorMessage } from "../utils/getErrorMessage";

interface OwnerUser {
  id: number;
  username: string;
  email: string | null;
  role: string;
  school_name: string | null;
}

// system_admin only — the one path to an owner account's password, kept
// separate from PasswordManagementSection (teacher/parent resets): a
// system_admin can only ever reach owner accounts via
// /system-admin/owners/:id/reset-password, a different endpoint from the
// /admin/users/:id/reset-password one Admin/Owner use for their own
// staff/parents. GET /admin/users-all is paginated server-side now
// (pageSize capped at 100 backend-side) — fetched once at the max page
// size and filtered to role === "owner" client-side, since there's no
// dedicated "list owners" endpoint and no per-platform expectation of
// more than a handful of schools/owners.
const OwnerPasswordResetSection: React.FC = () => {
  const [users, setUsers] = useState<OwnerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { confirm, ConfirmDialog } = useConfirm();

  const loadOwners = async () => {
    try {
      const res = await api.get("/admin/users-all", {
        params: { page: 0, pageSize: 100 }
      });
      setUsers(res.data.users || []);
      setError(null);
    } catch (err) {
      console.error("Failed to load owners", err);
      setError(getErrorMessage(err, "Failed to load owners."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOwners();
  }, []);

  const handleResetOwnerPassword = async (userId: number, label: string) => {
    if (!(await confirm(`Reset ${label}'s password? A new one-time password will be generated.`))) return;

    try {
      const res = await api.post(`/system-admin/owners/${userId}/reset-password`);
      setSuccess(
        `Password reset for ${label}. One-time password: ${res.data.temporaryPassword} — share this with them directly, it won't be shown again.`
      );
    } catch (err) {
      console.error("Reset owner password error:", err);
      setError(getErrorMessage(err, "Failed to reset password"));
    }
  };

  if (loading) return <p style={styles.text}>Loading owners…</p>;

  const owners = users.filter(u => u.role === "owner");

  return (
    <div style={styles.card}>
      {ConfirmDialog}

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 }}>
          {success}
        </div>
      )}

      <h3 style={{ marginBottom: 16 }}>Owners</h3>
      <p style={{ ...styles.text, fontSize: 13, color: "#64748b", marginBottom: 16 }}>
        System admins can only reset owner accounts here — teacher and parent
        password resets are handled from Teacher Management and Student & Parent
        Overview.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ ...styles.table, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Username</th>
              <th style={{ textAlign: "left" }}>Email</th>
              <th style={{ textAlign: "left" }}>School</th>
              <th style={{ textAlign: "center", width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {owners.map(u => (
              <tr key={u.id}>
                <td><strong>{u.username}</strong></td>
                <td>{u.email || "—"}</td>
                <td>{u.school_name || "—"}</td>
                <td style={{ textAlign: "center" }}>
                  <button
                    onClick={() => handleResetOwnerPassword(u.id, u.username)}
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
    </div>
  );
};

export default OwnerPasswordResetSection;
