import React, { useContext, useEffect, useState } from "react";
import { api } from "../api";
import { AuthContext } from "../AuthContext";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import SearchSort from "./SearchSort";
import Pagination from "./Pagination";
import { useConfirm } from "./ConfirmDialog";
import { getErrorMessage } from "../utils/getErrorMessage";

const PAGE_SIZE = 5;

interface RoleItem {
  id: number;
  name: string;
}

interface UserItem {
  id: number;
  username: string;
  role: string;
}

// Owner's "All Users" — grant/remove a role or delete a user, nothing
// more. This is deliberately a *different*, simpler component from
// SystemAdminAllUsersSection: system_admin's equivalent table also lets an
// admin view/edit a user's full profile details (matching
// MaintainerDashboard's own "Users & Roles" section) — a real feature
// difference, not just styling, so it isn't shared here.
const AllUsersSection: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("az");
  const [roles, setRoles] = useState<RoleItem[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { confirm, ConfirmDialog } = useConfirm();
  const { user } = useContext(AuthContext);

  // Each role can only grant roles at or below its own level — see the
  // same comment in ApprovalsSection.tsx, which duplicates this logic for
  // its own role-select dropdown (small enough that sharing it via a
  // helper isn't worth the indirection).
  const excludedRoles: string[] =
    user?.role === "system_admin"
      ? ["pending"]
      : user?.role === "owner"
        ? ["pending", "system_admin"]
        : ["pending", "owner", "maintainer", "system_admin"];

  const loadUsers = async () => {
    try {
      const res = await api.get("/admin/users-all", {
        params: { page, pageSize: PAGE_SIZE, search, sort }
      });
      setUsers(res.data.users || []);
      setTotalUsers(res.data.total || 0);
    } catch (err) {
      console.error("Failed to load users", err);
      setError(getErrorMessage(err, "Failed to load users."));
    }
  };

  const loadRoles = async () => {
    try {
      const res = await api.get("/admin/roles");
      setRoles((res.data || []).filter((r: RoleItem) => !excludedRoles.includes(r.name)));
    } catch (err) {
      console.error("Failed to load roles", err);
      setError(getErrorMessage(err, "Failed to load roles."));
    }
  };

  useEffect(() => {
    loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, sort]);

  const grantRole = async (id: number, role: string) => {
    try {
      await api.post(`/admin/approve/${id}`, { role });
      loadUsers();
      setSuccess("Role granted successfully.");
    } catch (err) {
      console.error("Grant role error:", err);
      setError(getErrorMessage(err, "Failed to grant role"));
    }
  };

  const deleteUser = async (id: number) => {
    if (!(await confirm("Delete this user?"))) return;

    try {
      await api.delete(`/admin/users/${id}`);
      loadUsers();
      setSuccess("User deleted successfully.");
    } catch (err) {
      console.error("Delete user error:", err);
      setError(getErrorMessage(err, "Failed to delete user"));
    }
  };

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

      <h3>All Users</h3>
      <p style={{ marginBottom: 16, color: "#475569" }}>
        Grant roles, remove roles, or delete users.
      </p>

      <SearchSort search={search} onSearch={setSearch} sort={sort} onSort={setSort} />

      <div style={{ overflowX: "auto" }}>
      <table style={{ ...styles.table, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>ID</th>
            <th style={{ textAlign: "left" }}>Username</th>
            <th style={{ textAlign: "left" }}>Role</th>
            <th style={{ textAlign: "center", width: 320 }}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.username}</td>
              <td>{u.role}</td>

              <td style={{ textAlign: "center" }}>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "center",
                    flexWrap: "wrap"
                  }}
                >
                  {/* GRANT ROLE */}
                  <select
                    defaultValue=""
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      minWidth: 140
                    }}
                    onChange={(e) => {
                      if (e.target.value) grantRole(u.id, e.target.value);
                    }}
                  >
                    <option value="">Grant role…</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.name}>
                        {r.name.charAt(0).toUpperCase() + r.name.slice(1)}
                      </option>
                    ))}
                  </select>

                  {/* DELETE USER */}
                  <button
                    style={{
                      padding: "6px 10px",
                      background: "#dc2626",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer"
                    }}
                    onClick={() => deleteUser(u.id)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <Pagination page={page} setPage={setPage} pageSize={PAGE_SIZE} total={totalUsers} />
    </div>
  );
};

export default AllUsersSection;
