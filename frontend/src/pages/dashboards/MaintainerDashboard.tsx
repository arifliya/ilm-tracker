import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { dashboardStyles as styles } from "../../styles/dashboardStyles";
import BaseDashboard, { DashboardNavItem } from "../../components/BaseDashboard";
import SearchSort from "../../components/SearchSort";
import Pagination from "../../components/Pagination";
import { useConfirm } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { formatDate } from "../../utils/formatDate";
import { usePolling } from "../../hooks/usePolling";

const PAGE_SIZE = 8;
const POLL_INTERVAL_MS = 30000;

type SectionKey = "dashboard" | "users_roles" | "add_role" | "notifications";

const BASE_NAV_ITEMS: DashboardNavItem[] = [
  { key: "dashboard", icon: "🏠", label: "Dashboard" },
  { key: "users_roles", icon: "👥", label: "Users & Roles" },
  { key: "add_role", icon: "➕", label: "Add Role" }
];

const SECTION_TITLES: Record<SectionKey, string> = {
  dashboard: "Dashboard Overview",
  users_roles: "Users & Roles",
  add_role: "Add New Role",
  notifications: "Notifications"
};

interface RoleItem {
  id: number;
  name: string;
}

interface UserStudentInfo {
  first_name: string;
  surname: string;
  address1: string;
}

interface UserItem {
  id: number;
  username: string;
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
  email: string | null;
  role: string;
  students?: UserStudentInfo[];
}

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  sender_first_name: string;
  sender_last_name: string;
}

const MaintainerDashboard: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [searchUsers, setSearchUsers] = useState("");
  const [sortUsers, setSortUsers] = useState("az");
  const [pageUsers, setPageUsers] = useState(0);

  const [selectedSection, setSelectedSection] =
    useState<SectionKey>("dashboard");

  const [newRole, setNewRole] = useState("");
  const [roleMessage, setRoleMessage] = useState("");
  const [roleMessageType, setRoleMessageType] = useState("success");

  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [editData, setEditData] = useState<Record<number, any>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [myNotifications, setMyNotifications] = useState<NotificationItem[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  const { confirm, ConfirmDialog } = useConfirm();

  const loadAll = async () => {
    try {
      const [rolesRes, myNotificationsRes, featuresRes] = await Promise.all([
        api.get("/admin/roles"),
        api.get("/notifications"),
        api.get("/features")
      ]);
      setRoles(rolesRes.data || []);
      setMyNotifications(myNotificationsRes.data || []);
      setFeatures(featuresRes.data?.flags || {});
      setLoadError(null);
    } catch (err) {
      console.error("Failed to load maintainer data", err);
      setLoadError(getErrorMessage(err, "Failed to load dashboard data."));
    }
  };

  // Paginated/searched/sorted server-side now (was: fetch the whole users
  // table and slice it client-side) — a separate load function, and a
  // separate effect keyed on the params that should re-fetch, rather than
  // folded into loadAll: loadAll's own callers (mount, polling) don't know
  // about page/search/sort, and re-running the *other* three requests
  // every time the user types a search character would be wasteful.
  const loadUsers = async () => {
    try {
      const res = await api.get("/admin/users-all", {
        params: { page: pageUsers, pageSize: PAGE_SIZE, search: searchUsers, sort: sortUsers }
      });
      setUsers(res.data.users || []);
      setTotalUsers(res.data.total || 0);
      setLoadError(null);
    } catch (err) {
      console.error("Failed to load users", err);
      setLoadError(getErrorMessage(err, "Failed to load users."));
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageUsers, searchUsers, sortUsers]);

  usePolling(() => {
    loadAll();
    loadUsers();
  }, POLL_INTERVAL_MS);

  const deleteUser = async (userId: number) => {
    if (!(await confirm("Are you sure you want to delete this user?"))) return;

    try {
      await api.delete(`/admin/users/${userId}`);
      loadUsers();
      setSuccessMessage("User deleted successfully.");
    } catch (err) {
      console.error("User delete error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete user."));
    }
  };

  const totalRoles = roles.length;

  const saveDetails = async (id: number, role: string) => {
    try {
      await api.put(`/admin/users/${id}/update-details`, {
        ...editData[id],
        role
      });
      loadUsers();
      setSuccessMessage("User details saved successfully.");
    } catch (err) {
      console.error("Save details error:", err);
      setLoadError(getErrorMessage(err, "Failed to save user details."));
    }
  };

  const addRole = async () => {
    if (!newRole.trim()) {
      setRoleMessage("Role name cannot be empty");
      setRoleMessageType("error");
      return;
    }

    try {
      const res = await api.post("/admin/roles/add", { name: newRole.trim() });

      if (res.data.success) {
        setRoleMessage("Role added successfully");
        setRoleMessageType("success");
        setNewRole("");
        loadAll();
      } else {
        setRoleMessage(res.data.message || "Failed to add role");
        setRoleMessageType("error");
      }
    } catch (err) {
      setRoleMessage(getErrorMessage(err, "Server error while adding role"));
      setRoleMessageType("error");
    }
  };

  const markNotificationRead = async (id: number) => {
    setMyNotifications(prev =>
      prev.map(n => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    );
    try {
      await api.post(`/notifications/${id}/read`);
    } catch (err) {
      console.error("Mark notification read error:", err);
    }
  };

  const navItems = features.notifications
    ? [...BASE_NAV_ITEMS, { key: "notifications", icon: "📣", label: "Notifications" }]
    : BASE_NAV_ITEMS;

  return (
    <BaseDashboard
      navItems={navItems}
      selectedSection={selectedSection}
      onSelectSection={key => setSelectedSection(key as SectionKey)}
      title={SECTION_TITLES[selectedSection]}
      error={loadError}
      onDismissError={() => setLoadError(null)}
      success={successMessage}
      onDismissSuccess={() => setSuccessMessage(null)}
    >
      {ConfirmDialog}

      {/* ---------------------- DASHBOARD SECTION ---------------------- */}
      {selectedSection === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Welcome, Maintainer</h3>
            <p style={styles.text}>
              Manage users, roles, and system-wide permissions from this
              dashboard. Use the sidebar to navigate between sections.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap"
            }}
          >
            <div style={{ ...styles.card, flex: "1 1 200px" }}>
              <h4>Total Users</h4>
              <p style={styles.text}>{totalUsers}</p>
            </div>

            <div style={{ ...styles.card, flex: "1 1 200px" }}>
              <h4>Roles in System</h4>
              <p style={styles.text}>{totalRoles}</p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------- USERS & ROLES SECTION ---------------------- */}
      {selectedSection === "users_roles" && (
        <div style={styles.card}>
          <SearchSort
            search={searchUsers}
            onSearch={v => setSearchUsers(v)}
            sort={sortUsers}
            onSort={v => setSortUsers(v)}
          />

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
                <th style={{ textAlign: "center", width: 180 }}>
                  View and Edit Details
                </th>
              </tr>
            </thead>

            <tbody>
              {users.map((u) => (
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

                    {/* VIEW & EDIT BUTTON — HIDDEN FOR STUDENT USERS */}
                    <td style={{ textAlign: "center" }}>
                      {u.role !== "student" && (
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
                            padding: "6px 12px",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 14
                          }}
                        >
                          View & Edit Details
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* EXPANDED DETAILS — DISABLED FOR STUDENT USERS */}
                  {expandedRows[u.id] && u.role !== "student" && (
                    <tr>
                      <td colSpan={7} style={{ background: "#f1f5f9", padding: 20 }}>
                        <h3 style={{ marginBottom: 16 }}>User Details</h3>

                        {/* REGISTRATION‑STYLE GRID */}
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
                          u.students.some((s) => s && s.first_name) && (
                            <div style={{ marginTop: 30 }}>
                              <h3 style={{ marginBottom: 12 }}>Student(s)</h3>

                              {u.students
                                .filter((s) => s && s.first_name)
                                .map((s, idx: number) => (
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

          <Pagination
            page={pageUsers}
            setPage={setPageUsers}
            pageSize={PAGE_SIZE}
            total={totalUsers}
          />
        </div>
      )}

      {/* ---------------------- ADD NEW ROLE SECTION ---------------------- */}
      {selectedSection === "add_role" && (
        <div style={styles.card}>
          <h3 style={{ marginBottom: 12 }}>Add New Role</h3>

          <p style={{ marginBottom: 16, color: "#475569" }}>
            Create a new system role. This will immediately become available
            for assignment.
          </p>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="text"
              placeholder="Enter role name (e.g., librarian)"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                fontSize: "15px"
              }}
            />

            <button
              onClick={addRole}
              style={{
                background: "#16a34a",
                color: "white",
                padding: "10px 16px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "15px"
              }}
            >
              Add Role
            </button>
          </div>

          {roleMessage && (
            <p
              style={{
                marginTop: "10px",
                color: roleMessageType === "success" ? "#16a34a" : "#dc2626",
                fontWeight: 600
              }}
            >
              {roleMessage}
            </p>
          )}

          <h4 style={{ marginTop: 28, marginBottom: 12 }}>Existing Roles</h4>

          {roles.length === 0 ? (
            <p style={styles.text}>No roles found.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {roles.map(r => (
                <span
                  key={r.id}
                  style={{
                    background: "#e5e7eb",
                    color: "#334155",
                    padding: "6px 12px",
                    borderRadius: 20,
                    fontSize: 13,
                    fontWeight: 600
                  }}
                >
                  {r.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------- NOTIFICATIONS ---------------------- */}
      {selectedSection === "notifications" && features.notifications && (
        <div style={styles.card}>
          <h3 style={{ marginBottom: 16 }}>Notifications</h3>

          {myNotifications.length === 0 ? (
            <p style={styles.text}>You have no notifications yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {myNotifications.map((n) => {
                const isUnread = !n.read_at;
                return (
                  <div
                    key={n.id}
                    onClick={() => isUnread && markNotificationRead(n.id)}
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      borderLeft: isUnread ? "4px solid #2563eb" : "4px solid #e2e8f0",
                      background: isUnread ? "#eff6ff" : "#fff",
                      cursor: isUnread ? "pointer" : "default"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: isUnread ? 700 : 600 }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{formatDate(n.created_at)}</div>
                    </div>
                    <div style={{ marginTop: 6, color: "#334155" }}>{n.message}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
                      From {n.sender_first_name} {n.sender_last_name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </BaseDashboard>
  );
};

export default MaintainerDashboard;
