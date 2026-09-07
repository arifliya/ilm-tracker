import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";

interface RoleItem {
  id: number;
  name: string;
}

// system_admin only — role creation is platform-wide, so there's no other
// dashboard this could be shared with.
const RolesSection: React.FC = () => {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [newRole, setNewRole] = useState("");
  const [roleMessage, setRoleMessage] = useState("");
  const [roleMessageType, setRoleMessageType] = useState("success");

  const loadRoles = async () => {
    try {
      const res = await api.get("/admin/roles");
      setRoles(res.data || []);
    } catch (err) {
      console.error("Failed to load roles", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

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
        await loadRoles();
      } else {
        setRoleMessage(res.data.message || "Failed to add role");
        setRoleMessageType("error");
      }
    } catch (err) {
      setRoleMessage(getErrorMessage(err, "Server error while adding role"));
      setRoleMessageType("error");
    }
  };

  if (loading) return <p style={styles.text}>Loading roles…</p>;

  return (
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
  );
};

export default RolesSection;
