import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import SearchSort from "./SearchSort";
import Pagination from "./Pagination";
import { useConfirm } from "./ConfirmDialog";
import { getErrorMessage } from "../utils/getErrorMessage";

const PAGE_SIZE = 8;

interface RoleItem {
  id: number;
  name: string;
}

interface StudentCard {
  id: number;
  first_name: string;
  surname: string;
  address1: string | null;
}

interface UserItem {
  id: number;
  username: string;
  role: string;
  school_name: string | null;
  email: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  address1: string | null;
  address2: string | null;
  address3: string | null;
  city: string | null;
  postcode: string | null;
  medical_condition: string | null;
  disability: string | null;
  students: StudentCard[];
}

// system_admin's "All Users" — richer than AllUsersSection.tsx (Owner's):
// grant a role same as Owner, but also view/edit a user's full profile
// details in place, matching MaintainerDashboard.tsx's own "Users &
// Roles" section (same expand-in-place edit grid, same student cards
// block) — a real feature difference from Owner's simpler table, not
// just styling, so it's a separate component rather than one shared with
// AllUsersSection.tsx. system_admin can grant any role except "pending"
// (it's the only role above every other role in the hierarchy), unlike
// Owner/Admin's more restricted lists.
const SystemAdminAllUsersSection: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("az");
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [editData, setEditData] = useState<Record<number, any>>({});

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { confirm, ConfirmDialog } = useConfirm();

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
      setRoles((res.data || []).filter((r: RoleItem) => r.name !== "pending"));
    } catch (err) {
      console.error("Failed to load roles", err);
      setError(getErrorMessage(err, "Failed to load roles."));
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

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

  const saveDetails = async (id: number, role: string) => {
    try {
      await api.put(`/admin/users/${id}/update-details`, {
        ...editData[id],
        role
      });
      loadUsers();
      setSuccess("User details saved successfully.");
    } catch (err) {
      console.error("Save details error:", err);
      setError(getErrorMessage(err, "Failed to save user details."));
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
        View, edit, grant roles to, or delete any user in the system.
      </p>

      <SearchSort search={search} onSearch={setSearch} sort={sort} onSort={setSort} />

      <div style={{ overflowX: "auto" }}>
        <table style={{ ...styles.table, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>First Name</th>
              <th style={{ textAlign: "left" }}>Last Name</th>
              <th style={{ textAlign: "left" }}>Email</th>
              <th style={{ textAlign: "left" }}>Address</th>
              <th style={{ textAlign: "left" }}>Username</th>
              <th style={{ textAlign: "left" }}>Role</th>
              <th style={{ textAlign: "center", width: 320 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.map(u => (
              <React.Fragment key={u.id}>
                {/* MAIN ROW */}
                <tr>
                  <td>{u.first_name || "-"}</td>
                  <td>{u.last_name || "-"}</td>
                  <td>{u.email || "-"}</td>
                  <td>{u.address1 || "-"}</td>
                  <td><strong>{u.username}</strong></td>
                  <td>
                    <span
                      style={{
                        background: "#e5e7eb",
                        padding: "4px 8px",
                        borderRadius: 6
                      }}
                    >
                      {u.role}
                    </span>
                  </td>

                  <td style={{ textAlign: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "center",
                        alignItems: "center",
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
                          width: 130
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

                      {/* VIEW & EDIT — a same-size placeholder keeps Delete's
                          position consistent across rows for student users,
                          who don't get this button */}
                      {u.role !== "student" ? (
                        <button
                          onClick={() => {
                            setExpandedRows(prev => ({
                              ...prev,
                              [u.id]: !prev[u.id]
                            }));
                            setEditData(prev => ({
                              ...prev,
                              [u.id]: {
                                first_name: u.first_name || "",
                                middle_name: u.middle_name || "",
                                last_name: u.last_name || "",
                                date_of_birth: u.date_of_birth || "",
                                address1: u.address1 || "",
                                address2: u.address2 || "",
                                address3: u.address3 || "",
                                city: u.city || "",
                                postcode: u.postcode || "",
                                medical_condition: u.medical_condition || "",
                                disability: u.disability || "",
                                email: u.email || ""
                              }
                            }));
                          }}
                          style={{
                            background: "#3b82f6",
                            color: "white",
                            border: "none",
                            padding: "6px 10px",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 13,
                            width: 92
                          }}
                        >
                          View & Edit
                        </button>
                      ) : (
                        <span style={{ width: 92 }} aria-hidden="true" />
                      )}

                      {/* DELETE USER */}
                      <button
                        style={{
                          padding: "6px 10px",
                          background: "#dc2626",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 13,
                          width: 72
                        }}
                        onClick={() => deleteUser(u.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>

                {/* EXPANDED DETAILS — DISABLED FOR STUDENT USERS */}
                {expandedRows[u.id] && u.role !== "student" && (
                  <tr>
                    <td colSpan={7} style={{ background: "#f1f5f9", padding: 20 }}>
                      <h3 style={{ marginBottom: 16 }}>User Details</h3>

                      <div
                        className="edit-details-grid"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 20
                        }}
                      >
                        <div>
                          <label style={styles.label}>First name *</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.first_name}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  first_name: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>Middle name</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.middle_name}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  middle_name: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>Surname *</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.last_name}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  last_name: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>Date of birth</label>
                          <input
                            type="date"
                            style={styles.input}
                            value={editData[u.id]?.date_of_birth}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  date_of_birth: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>Address line 1</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.address1}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  address1: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>Address line 2</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.address2}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  address2: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>Address line 3</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.address3}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  address3: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>City</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.city}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  city: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>Postcode</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.postcode}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  postcode: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>Medical condition</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.medical_condition}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  medical_condition: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>Disability</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.disability}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  disability: e.target.value
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          <label style={styles.label}>Email *</label>
                          <input
                            style={styles.input}
                            value={editData[u.id]?.email}
                            onChange={(e) =>
                              setEditData(prev => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  email: e.target.value
                                }
                              }))
                            }
                          />
                        </div>
                      </div>

                      {/* STUDENT CARDS — PARENT ONLY & ONLY REAL STUDENTS */}
                      {u.role === "parent" &&
                        Array.isArray(u.students) &&
                        u.students.some(s => s && s.first_name) && (
                          <div style={{ marginTop: 30 }}>
                            <h3 style={{ marginBottom: 12 }}>Student(s)</h3>

                            {u.students
                              .filter(s => s && s.first_name)
                              .map((s, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    padding: 12,
                                    marginBottom: 12,
                                    background: "#fff",
                                    borderRadius: 8,
                                    border: "1px solid #e5e7eb"
                                  }}
                                >
                                  <p><strong>Name:</strong> {s.first_name} {s.surname}</p>
                                  <p><strong>Address:</strong> {s.address1}</p>
                                </div>
                              ))}
                          </div>
                        )}

                      {/* SAVE BUTTON */}
                      <button
                        onClick={() => saveDetails(u.id, u.role)}
                        style={{
                          marginTop: 20,
                          background: "#16a34a",
                          color: "white",
                          border: "none",
                          padding: "8px 16px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 15
                        }}
                      >
                        Save Changes
                      </button>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} setPage={setPage} pageSize={PAGE_SIZE} total={totalUsers} />
    </div>
  );
};

export default SystemAdminAllUsersSection;
