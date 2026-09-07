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

interface PendingUserItem {
  id: number;
  username: string;
  email: string | null;
  requested_role: string | null;
  school_name: string | null;
  first_name: string | null;
  last_name: string | null;
  contact_number: string | null;
}

interface GuardianRequestItem {
  student_id: number;
  parent_id: number;
  requested_at: string;
  student_first_name: string | null;
  student_last_name: string | null;
  school_id: number;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_email: string | null;
}

// Shared across AdminDashboard/OwnerDashboard/SystemAdminDashboard —
// identical functionality for all three, so it lives here rather than
// being duplicated in each dashboard file. Two independent sub-concerns
// (pending-user approval, guardian-link requests) that happen to share one
// nav item.
const ApprovalsSection: React.FC = () => {
  const [pendingUsers, setPendingUsers] = useState<PendingUserItem[]>([]);
  const [totalPendingUsers, setTotalPendingUsers] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("az");
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [approveRole, setApproveRole] = useState<Record<number, string>>({});
  const [viewUser, setViewUser] = useState<PendingUserItem | null>(null);

  const [guardianRequests, setGuardianRequests] = useState<GuardianRequestItem[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { confirm, ConfirmDialog } = useConfirm();
  const { user } = useContext(AuthContext);
  // system_admin is platform-wide (not scoped to one school), so it's the
  // only role that needs to see which school a pending request belongs to
  // — admin/owner already know, since everything they see is their own
  // school. Self-gated from the logged-in user's role rather than a prop,
  // so this one shared component works correctly regardless of which
  // dashboard mounts it.
  const showSchoolColumn = user?.role === "system_admin";

  // Each role can only grant roles at or below its own level — mirrors the
  // three different filters the pre-split dashboards each hardcoded for
  // this same dropdown (admin's was the most restrictive, system_admin's
  // the least), now computed from the logged-in user instead of one fixed
  // list per dashboard file.
  const excludedRoles: string[] =
    user?.role === "system_admin"
      ? ["pending"]
      : user?.role === "owner"
        ? ["pending", "system_admin"]
        : ["pending", "owner", "maintainer", "system_admin"];

  const loadPendingUsers = async () => {
    try {
      const res = await api.get("/admin/pending-users", {
        params: { page, pageSize: PAGE_SIZE, search, sort }
      });
      setPendingUsers(res.data.pendingUsers || []);
      setTotalPendingUsers(res.data.total || 0);
    } catch (err) {
      console.error("Failed to load pending users", err);
      setError(getErrorMessage(err, "Failed to load pending users."));
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

  const loadGuardianRequests = async () => {
    try {
      const res = await api.get("/admin/guardian-requests");
      setGuardianRequests(res.data || []);
    } catch (err) {
      console.error("Failed to load guardian requests", err);
      setError(getErrorMessage(err, "Failed to load guardian requests."));
    }
  };

  useEffect(() => {
    loadRoles();
    loadGuardianRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    loadPendingUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, sort]);

  const approveUser = async (userId: number) => {
    const role = approveRole[userId];
    if (!role) {
      setError("Please select a role before approving.");
      return;
    }

    try {
      const res = await api.post(`/admin/approve/${userId}`, { role });
      loadPendingUsers();
      const studentAccounts = res.data.studentAccounts || [];
      if (studentAccounts.length > 0) {
        const creds = studentAccounts
          .map((s: any) => `${s.name} — username: ${s.username}, one-time password: ${s.temporaryPassword}`)
          .join("; ");
        setSuccess(`User approved successfully. Student login(s) created: ${creds} — share these directly, they won't be shown again.`);
      } else {
        setSuccess("User approved successfully.");
      }
    } catch (err) {
      console.error("Approve user error:", err);
      setError(getErrorMessage(err, "Failed to approve user"));
    }
  };

  const rejectUser = async (userId: number) => {
    if (!(await confirm("Reject this user?"))) return;

    try {
      await api.post(`/admin/reject/${userId}`);
      loadPendingUsers();
      setSuccess("User rejected successfully.");
    } catch (err) {
      console.error("Reject user error:", err);
      setError(getErrorMessage(err, "Failed to reject user"));
    }
  };

  const approveGuardianRequest = async (studentId: number, parentId: number) => {
    try {
      await api.post("/admin/guardian-requests/approve", { student_id: studentId, parent_id: parentId });
      await loadGuardianRequests();
      setSuccess("Guardian request approved.");
    } catch (err) {
      console.error("Approve guardian request error:", err);
      setError(getErrorMessage(err, "Failed to approve guardian request"));
    }
  };

  const rejectGuardianRequest = async (studentId: number, parentId: number) => {
    if (!(await confirm("Reject this guardian link request?"))) return;

    try {
      await api.post("/admin/guardian-requests/reject", { student_id: studentId, parent_id: parentId });
      await loadGuardianRequests();
      setSuccess("Guardian request rejected.");
    } catch (err) {
      console.error("Reject guardian request error:", err);
      setError(getErrorMessage(err, "Failed to reject guardian request"));
    }
  };

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
        <h3 style={{ marginBottom: 16 }}>Pending User Approvals</h3>

        <SearchSort search={search} onSearch={setSearch} sort={sort} onSort={setSort} />

        <div style={{ overflowX: "auto" }}>
        <table style={{ ...styles.table, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Username</th>
              <th style={{ textAlign: "left" }}>First Name</th>
              <th style={{ textAlign: "left" }}>Surname</th>
              <th style={{ textAlign: "left" }}>Contact Number</th>
              <th style={{ textAlign: "left" }}>Email</th>
              <th style={{ textAlign: "center" }}>Requested Role</th>
              {showSchoolColumn && <th style={{ textAlign: "left" }}>School</th>}
              <th style={{ textAlign: "center", width: 140 }}>Select Role</th>
              <th style={{ textAlign: "center", width: 200 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {pendingUsers.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.username}</strong>
                </td>
                <td>{u.first_name || "—"}</td>
                <td>{u.last_name || "—"}</td>
                <td>{u.contact_number || "—"}</td>
                <td>{u.email || "—"}</td>

                <td style={{ textAlign: "center" }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 8,
                      background: "#e0e7ff",
                      color: "#3730a3",
                      fontWeight: 600,
                      fontSize: 13
                    }}
                  >
                    {u.requested_role || "—"}
                  </span>
                </td>

                {showSchoolColumn && (
                  <td>{u.requested_role === "staff" ? u.school_name || "—" : "—"}</td>
                )}

                <td style={{ textAlign: "center" }}>
                  {showSchoolColumn && u.requested_role === "parent" ? (
                    "—"
                  ) : (
                    <select
                      value={approveRole[u.id] || ""}
                      onChange={e =>
                        setApproveRole(prev => ({
                          ...prev,
                          [u.id]: e.target.value
                        }))
                      }
                      style={{
                        ...styles.input,
                        width: "100%",
                        maxWidth: 160
                      }}
                    >
                      <option value="">Select role</option>
                      {roles.map(r => (
                        <option key={r.id} value={r.name}>
                          {r.name.charAt(0).toUpperCase() + r.name.slice(1)}
                        </option>
                      ))}
                    </select>
                  )}
                </td>

                <td
                  style={{
                    textAlign: "center",
                    display: "flex",
                    gap: 8,
                    justifyContent: "center",
                    alignItems: "center"
                  }}
                >
                  <button
                    onClick={() => setViewUser(u)}
                    style={{
                      background: "#3b82f6",
                      color: "white",
                      border: "none",
                      padding: "6px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 13
                    }}
                  >
                    View
                  </button>

                  {showSchoolColumn && u.requested_role === "parent" ? (
                    <span style={{ fontSize: 12, color: "#64748b" }}>Handled by school admin/owner</span>
                  ) : (
                    <>
                  <button
                    onClick={() => approveUser(u.id)}
                    style={{
                      background: "#16a34a",
                      color: "white",
                      border: "none",
                      padding: "6px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 13
                    }}
                  >
                    Approve
                  </button>

                  <button
                    onClick={() => rejectUser(u.id)}
                    style={{
                      background: "#dc2626",
                      color: "white",
                      border: "none",
                      padding: "6px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 13
                    }}
                  >
                    Reject
                  </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <Pagination page={page} setPage={setPage} pageSize={PAGE_SIZE} total={totalPendingUsers} />
      </div>

      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Guardian Requests</h3>
        <p style={{ ...styles.text, fontSize: 13, color: "#64748b" }}>
          Self-service requests from an already-approved parent asking to link as an additional
          guardian on a child that isn't theirs yet.
        </p>

        {guardianRequests.length === 0 ? (
          <p style={styles.text}>No pending guardian requests.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Student</th>
                  <th style={{ textAlign: "left" }}>Requesting Parent</th>
                  <th style={{ textAlign: "left" }}>Email</th>
                  <th style={{ textAlign: "center", width: 180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {guardianRequests.map((r) => (
                  <tr key={`${r.student_id}-${r.parent_id}`}>
                    <td>
                      {r.student_first_name} {r.student_last_name}
                    </td>
                    <td>
                      {r.parent_first_name} {r.parent_last_name}
                    </td>
                    <td>{r.parent_email}</td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        style={{ ...styles.secondaryBtn, marginRight: 6 }}
                        onClick={() => approveGuardianRequest(r.student_id, r.parent_id)}
                      >
                        Approve
                      </button>
                      <button
                        style={{ ...styles.secondaryBtn, background: "#dc2626", color: "#fff" }}
                        onClick={() => rejectGuardianRequest(r.student_id, r.parent_id)}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewUser && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 12,
              width: "90%",
              maxWidth: 450,
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 16 }}>User Details</h3>

            <div>
              <strong>Username:</strong> {viewUser.username}
            </div>
            <div>
              <strong>First Name:</strong> {viewUser.first_name}
            </div>
            <div>
              <strong>Surname:</strong> {viewUser.last_name}
            </div>
            <div>
              <strong>Email:</strong> {viewUser.email}
            </div>
            <div>
              <strong>Contact Number:</strong> {viewUser.contact_number}
            </div>
            <div>
              <strong>Requested Role:</strong> {viewUser.requested_role}
            </div>

            <button
              onClick={() => setViewUser(null)}
              style={{
                marginTop: 20,
                background: "#334155",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: 6,
                cursor: "pointer",
                width: "100%"
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalsSection;
