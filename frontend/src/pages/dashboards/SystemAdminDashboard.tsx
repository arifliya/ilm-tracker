import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { dashboardStyles as styles } from "../../styles/dashboardStyles";
import BaseDashboard, { DashboardNavItem } from "../../components/BaseDashboard";
import SearchSort from "../../components/SearchSort";
import Pagination from "../../components/Pagination";
import { useConfirm } from "../../components/ConfirmDialog";
import { sortData, paginate } from "../../utils/tableHelpers";
import { formatDate } from "../../utils/formatDate";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { usePolling } from "../../hooks/usePolling";

const PAGE_SIZE = 5;
const USERS_PAGE_SIZE = 8;
const POLL_INTERVAL_MS = 30000;

type SectionKey =
  | "dashboard"
  | "schools"
  | "class"
  | "teacher"
  | "sp"
  | "approvals"
  | "remove"
  | "users"
  | "roles"
  | "features"
  | "notifications";

const NAV_ITEMS: DashboardNavItem[] = [
  { key: "dashboard", icon: "🏠", label: "Dashboard" },
  { key: "schools", icon: "🏫", label: "Schools" },
  { key: "class", icon: "📚", label: "Class Management" },
  { key: "teacher", icon: "👨‍🏫", label: "Teacher Management" },
  { key: "sp", icon: "👨‍👩‍👧", label: "Student & Parent Overview" },
  { key: "approvals", icon: "📝", label: "Approvals" },
  { key: "remove", icon: "🗑️", label: "Remove Users" },
  { key: "users", icon: "👑", label: "All Users" },
  { key: "roles", icon: "➕", label: "Roles" },
  { key: "features", icon: "🚦", label: "Feature Toggles" },
  { key: "notifications", icon: "📣", label: "Notifications" }
];

const SECTION_TITLES: Record<SectionKey, string> = {
  dashboard: "Dashboard",
  schools: "Schools",
  class: "Class Management",
  teacher: "Teacher Management",
  sp: "Student & Parent Overview",
  approvals: "Approvals",
  remove: "Remove Users",
  users: "All Users",
  roles: "Roles",
  features: "Feature Toggles",
  notifications: "Notifications"
};

interface SchoolItem {
  id: number;
  name: string;
  school_code: string;
  created_at: string;
}

interface RoleItem {
  id: number;
  name: string;
}

interface FeatureFlag {
  id: number;
  feature_key: string;
  name: string;
  description: string | null;
  default_enabled: boolean | number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FeatureFlagOverride {
  school_id: number;
  feature_flag_id: number;
  enabled: boolean | number;
}

const toDatetimeLocal = (value: string | null) => {
  if (!value) return "";
  // MySQL DATETIME comes back as "YYYY-MM-DD HH:MM:SS" (or a full ISO string
  // via the driver) — <input type="datetime-local"> needs "YYYY-MM-DDTHH:MM".
  const normalized = value.replace(" ", "T");
  return normalized.slice(0, 16);
};

const SystemAdminDashboard: React.FC = () => {
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [lastCreatedSchoolCode, setLastCreatedSchoolCode] = useState<string | null>(null);
  const [newClassSchoolId, setNewClassSchoolId] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [studentsParents, setStudentsParents] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [editingClass, setEditingClass] = useState<any | null>(null);

  const [assignStudentClassId, setAssignStudentClassId] = useState("");
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignedStudents, setAssignedStudents] = useState<any[]>([]);

  const [newClassName, setNewClassName] = useState("");
  const [newClassYearGroup, setNewClassYearGroup] = useState("");
  const [newClassDescription, setNewClassDescription] = useState("");

  const [assignClassId, setAssignClassId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");

  const [approveRole, setApproveRole] = useState<Record<number, string>>({});
  const [viewUser, setViewUser] = useState<any | null>(null);
  const [searchRemove, setSearchRemove] = useState("");

  const [search, setSearch] = useState({
    class: "",
    teacher: "",
    sp: "",
    pending: ""
  });

  const [sort, setSort] = useState({
    class: "az",
    teacher: "az",
    sp: "az",
    pending: "az"
  });

  const [page, setPage] = useState({
    class: 0,
    teacher: 0,
    sp: 0,
    pending: 0
  });

  const [searchUsers, setSearchUsers] = useState("");
  const [sortUsers, setSortUsers] = useState("az");
  const [pageUsers, setPageUsers] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [editData, setEditData] = useState<Record<number, any>>({});

  const [newRole, setNewRole] = useState("");
  const [roleMessage, setRoleMessage] = useState("");
  const [roleMessageType, setRoleMessageType] = useState("success");

  const [expandedStudents, setExpandedStudents] = useState<Record<number, boolean>>({});
  const [selectedSection, setSelectedSection] = useState<SectionKey>("dashboard");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [featureFlagOverrides, setFeatureFlagOverrides] = useState<FeatureFlagOverride[]>([]);
  const [flagExpiryDrafts, setFlagExpiryDrafts] = useState<Record<number, string>>({});
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newFlagName, setNewFlagName] = useState("");
  const [newFlagDescription, setNewFlagDescription] = useState("");
  const [newFlagDefaultEnabled, setNewFlagDefaultEnabled] = useState(false);

  const [notificationSchoolId, setNotificationSchoolId] = useState("");
  const [notificationAudience, setNotificationAudience] = useState("");
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [sentNotifications, setSentNotifications] = useState<any[]>([]);

  const { confirm, ConfirmDialog } = useConfirm();

  const loadAll = async () => {
    try {
      const [schoolsRes, classRes, teacherRes, spRes, pendingRes, assignedRes, allUsersRes, rolesRes, flagsRes, sentNotificationsRes] =
        await Promise.all([
          api.get("/system-admin/schools"),
          api.get("/admin/classes"),
          api.get("/admin/teachers"),
          api.get("/admin/students-parents"),
          api.get("/admin/pending-users"),
          api.get("/admin/assigned-students"),
          api.get("/admin/users-all"),
          api.get("/admin/roles"),
          api.get("/system-admin/feature-flags"),
          api.get("/notifications/sent")
        ]);

      setSchools(schoolsRes.data || []);
      setClasses(classRes.data || []);
      setTeachers(teacherRes.data || []);
      setStudentsParents(spRes.data || []);
      setPendingUsers(pendingRes.data || []);
      setAssignedStudents(assignedRes.data || []);
      setUsers(allUsersRes.data || []);
      setRoles((rolesRes.data || []).filter((r: RoleItem) => r.name !== "pending"));
      setFeatureFlags(flagsRes.data?.flags || []);
      setFeatureFlagOverrides(flagsRes.data?.overrides || []);
      setSentNotifications(sentNotificationsRes.data || []);
      setLoadError(null);
    } catch (err) {
      console.error("Failed to load system admin data", err);
      setLoadError(getErrorMessage(err, "Failed to load dashboard data."));
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  usePolling(loadAll, POLL_INTERVAL_MS);

  const createSchool = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await api.post("/system-admin/schools", { name: newSchoolName });
      setNewSchoolName("");
      setLastCreatedSchoolCode(res.data?.school_code || null);
      loadAll();
      setSuccessMessage("School created successfully.");
    } catch (err) {
      console.error("Create school error:", err);
      setLoadError(getErrorMessage(err, "Failed to create school"));
    }
  };

  const isFlagEnabledForSchool = (featureKey: string, schoolId: number) => {
    const flag = featureFlags.find(f => f.feature_key === featureKey);
    if (!flag) return false;
    const override = featureFlagOverrides.find(
      o => o.feature_flag_id === flag.id && o.school_id === schoolId
    );
    return override ? !!override.enabled : !!flag.default_enabled;
  };

  const sendNotification = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!notificationSchoolId) {
      setLoadError("Please choose a school.");
      return;
    }
    if (!notificationAudience) {
      setLoadError("Please choose who this notification is for.");
      return;
    }

    try {
      const res = await api.post("/notifications", {
        school_id: Number(notificationSchoolId),
        audience: notificationAudience,
        title: notificationTitle,
        message: notificationMessage
      });

      setNotificationAudience("");
      setNotificationTitle("");
      setNotificationMessage("");
      loadAll();
      setSuccessMessage(`Notification sent to ${res.data.recipientCount} recipient(s).`);
    } catch (err) {
      console.error("Send notification error:", err);
      setLoadError(getErrorMessage(err, "Failed to send notification"));
    }
  };

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/admin/classes", {
        school_id: newClassSchoolId ? Number(newClassSchoolId) : undefined,
        class_name: newClassName,
        class_code: newClassCode,
        year_group: newClassYearGroup,
        description: newClassDescription
      });

      setNewClassSchoolId("");
      setNewClassName("");
      setNewClassCode("");
      setNewClassYearGroup("");
      setNewClassDescription("");
      loadAll();
      setSuccessMessage("Class created successfully.");
    } catch (err) {
      console.error("Create class error:", err);
      setLoadError(getErrorMessage(err, "Failed to create class"));
    }
  };

  const saveClassChanges = async () => {
    if (!editingClass) return;

    try {
      await api.put(`/admin/classes/${editingClass.id}`, {
        class_name: editingClass.class_name,
        class_code: editingClass.class_code,
        year_group: editingClass.year_group,
        description: editingClass.description
      });

      setEditingClass(null);
      loadAll();
      setSuccessMessage("Class updated successfully.");
    } catch (err) {
      console.error("Update class error:", err);
      setLoadError(getErrorMessage(err, "Failed to update class"));
    }
  };

  const handleDeleteClass = async (classId: number) => {
    if (!(await confirm("Are you sure you want to remove this class?"))) return;

    try {
      await api.delete(`/admin/classes/${classId}`);
      loadAll();
      setSuccessMessage("Class deleted successfully.");
    } catch (err) {
      console.error("Delete class error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete class"));
    }
  };

  const assignStudentToClass = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!assignStudentClassId || !assignStudentId) {
      setLoadError("Please select both a class and a student.");
      return;
    }

    try {
      await api.post(`/admin/classes/${assignStudentClassId}/assign-student`, {
        studentId: Number(assignStudentId)
      });

      setAssignStudentClassId("");
      setAssignStudentId("");
      loadAll();
      setSuccessMessage("Student assigned to class successfully.");
    } catch (err) {
      console.error("Assign student error:", err);
      setLoadError(getErrorMessage(err, "Failed to assign student"));
    }
  };

  const removeStudentFromClass = async (classId: number, studentId: number) => {
    if (!(await confirm("Remove this student from the class?"))) return;

    try {
      await api.post(`/admin/classes/${classId}/remove-student`, {
        studentId
      });

      loadAll();
      setSuccessMessage("Student removed from class successfully.");
    } catch (err) {
      console.error("Remove student error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove student"));
    }
  };

  const assignTeacher = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!assignClassId || !assignTeacherId) {
      setLoadError("Please select both a class and a teacher.");
      return;
    }

    try {
      await api.post(`/admin/classes/${assignClassId}/assign-teacher`, {
        teacherUserId: Number(assignTeacherId)
      });

      loadAll();
      setAssignClassId("");
      setAssignTeacherId("");
      setSuccessMessage("Teacher assigned to class successfully.");
    } catch (err) {
      console.error("Assign teacher error:", err);
      setLoadError(getErrorMessage(err, "Failed to assign teacher"));
    }
  };

  const handleRemoveTeacher = async (classId: number, teacherId: number) => {
    if (!(await confirm("Remove this teacher from the class?"))) return;

    try {
      await api.post(`/admin/classes/${classId}/remove-teacher`, {
        teacherUserId: teacherId
      });

      loadAll();
      setSuccessMessage("Teacher removed from class successfully.");
    } catch (err) {
      console.error("Remove teacher error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove teacher"));
    }
  };

  const handleDeleteTeacher = async (teacherId: number) => {
    if (!(await confirm("Remove this teacher?"))) return;

    try {
      await api.delete(`/admin/teachers/${teacherId}`);
      loadAll();
      setSuccessMessage("Teacher removed successfully.");
    } catch (err) {
      console.error("Delete teacher error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete teacher"));
    }
  };

  const approveUser = async (userId: number) => {
    const role = approveRole[userId];
    if (!role) {
      setLoadError("Please select a role before approving.");
      return;
    }

    try {
      await api.post(`/admin/approve/${userId}`, { role });
      loadAll();
      setSuccessMessage("User approved successfully.");
    } catch (err) {
      console.error("Approve user error:", err);
      setLoadError(getErrorMessage(err, "Failed to approve user"));
    }
  };

  const rejectUser = async (userId: number) => {
    if (!(await confirm("Reject this user?"))) return;

    try {
      await api.post(`/admin/reject/${userId}`);
      loadAll();
      setSuccessMessage("User rejected successfully.");
    } catch (err) {
      console.error("Reject user error:", err);
      setLoadError(getErrorMessage(err, "Failed to reject user"));
    }
  };

  const handleRemoveStudent = async (studentId: number) => {
    if (!(await confirm("Remove this student permanently?"))) return;

    try {
      await api.delete(`/admin/remove-student/${studentId}`);
      loadAll();
      setSuccessMessage("Student removed successfully.");
    } catch (err) {
      console.error("Remove student error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove student"));
    }
  };

  const handleRemoveParent = async (parentId: number) => {
    if (!(await confirm("Remove this parent permanently?"))) return;

    try {
      await api.delete(`/admin/remove-parent/${parentId}`);
      loadAll();
      setSuccessMessage("Parent removed successfully.");
    } catch (err) {
      console.error("Remove parent error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove parent"));
    }
  };

  const grantRole = async (id: number, role: string) => {
    try {
      await api.post(`/admin/approve/${id}`, { role });
      loadAll();
      setSuccessMessage("Role granted successfully.");
    } catch (err) {
      console.error("Grant role error:", err);
      setLoadError(getErrorMessage(err, "Failed to grant role"));
    }
  };

  const deleteUser = async (id: number) => {
    if (!(await confirm("Delete this user?"))) return;

    try {
      await api.delete(`/admin/users/${id}`);
      loadAll();
      setSuccessMessage("User deleted successfully.");
    } catch (err) {
      console.error("Delete user error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete user"));
    }
  };

  const saveDetails = async (id: number, role: string) => {
    try {
      await api.put(`/admin/users/${id}/update-details`, {
        ...editData[id],
        role
      });
      loadAll();
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

  const createFeatureFlag = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/system-admin/feature-flags", {
        feature_key: newFlagKey,
        name: newFlagName,
        description: newFlagDescription,
        default_enabled: newFlagDefaultEnabled
      });

      setNewFlagKey("");
      setNewFlagName("");
      setNewFlagDescription("");
      setNewFlagDefaultEnabled(false);
      loadAll();
      setSuccessMessage("Feature created successfully.");
    } catch (err) {
      console.error("Create feature flag error:", err);
      setLoadError(getErrorMessage(err, "Failed to create feature"));
    }
  };

  const setSchoolFeature = async (flagId: number, schoolId: number, enabled: boolean) => {
    try {
      await api.put(`/system-admin/feature-flags/${flagId}/schools/${schoolId}`, { enabled });
      loadAll();
      setSuccessMessage("School feature access updated.");
    } catch (err) {
      console.error("Set school feature error:", err);
      setLoadError(getErrorMessage(err, "Failed to update school feature access"));
    }
  };

  const resetSchoolFeature = async (flagId: number, schoolId: number) => {
    try {
      await api.delete(`/system-admin/feature-flags/${flagId}/schools/${schoolId}`);
      loadAll();
      setSuccessMessage("School reverted to the feature's default.");
    } catch (err) {
      console.error("Reset school feature error:", err);
      setLoadError(getErrorMessage(err, "Failed to reset school feature access"));
    }
  };

  const saveFeatureFlagExpiry = async (flag: FeatureFlag) => {
    const expiresAt = flagExpiryDrafts[flag.id] ?? toDatetimeLocal(flag.expires_at);

    try {
      await api.put(`/system-admin/feature-flags/${flag.id}`, {
        name: flag.name,
        description: flag.description,
        default_enabled: !!flag.default_enabled,
        expires_at: expiresAt || null
      });

      loadAll();
      setSuccessMessage("Expiry date saved.");
    } catch (err) {
      console.error("Save feature flag expiry error:", err);
      setLoadError(getErrorMessage(err, "Failed to save expiry date"));
    }
  };

  const deleteFeatureFlag = async (flag: FeatureFlag) => {
    if (!(await confirm(`Delete the "${flag.name}" feature toggle?`))) return;

    try {
      await api.delete(`/system-admin/feature-flags/${flag.id}`);
      loadAll();
      setSuccessMessage("Feature deleted successfully.");
    } catch (err) {
      console.error("Delete feature flag error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete feature"));
    }
  };

  return (
    <BaseDashboard
      navItems={NAV_ITEMS}
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
          {/* Welcome Card */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Welcome to your System Admin Dashboard</h3>

            <p style={styles.text}>
              As System Admin, you have the highest level of access in the
              application — everything an Owner, Admin, or Maintainer can do,
              in one place. Use this dashboard to oversee classes, teachers,
              parents, students, approvals, all user accounts, and system
              roles.
            </p>

            <p style={styles.text}>
              Select a module below to begin managing the school environment.
            </p>
          </div>

          {/* Quick Overview Cards */}
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap"
            }}
          >
            <div
              style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("schools")}
            >
              <h4 style={{ marginBottom: 8 }}>Schools</h4>
              <p style={styles.text}>
                Onboard new schools onto the platform and view their school codes.
              </p>
            </div>

            <div
              style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("class")}
            >
              <h4 style={{ marginBottom: 8 }}>Manage Classes</h4>
              <p style={styles.text}>
                Create, update, and organize school classes. Assign teachers and manage
                student enrollment.
              </p>
            </div>

            <div
              style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("teacher")}
            >
              <h4 style={{ marginBottom: 8 }}>Teacher Management</h4>
              <p style={styles.text}>
                View and manage teacher accounts, roles, and assigned classes.
              </p>
            </div>

            <div
              style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("sp")}
            >
              <h4 style={{ marginBottom: 8 }}>Students & Parents</h4>
              <p style={styles.text}>
                Access student and parent information, linked accounts, and school records.
              </p>
            </div>

            <div
              style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("approvals")}
            >
              <h4 style={{ marginBottom: 8 }}>Pending Approvals</h4>
              <p style={styles.text}>
                Review and approve new registrations, role changes, and account requests.
              </p>
            </div>

            <div
              style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("remove")}
            >
              <h4 style={{ marginBottom: 8 }}>Remove Users</h4>
              <p style={styles.text}>
                Remove students and parents from the system.
              </p>
            </div>

            <div
              style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("users")}
            >
              <h4 style={{ marginBottom: 8 }}>All Users</h4>
              <p style={styles.text}>
                View, edit, grant roles to, or delete any user account in the system.
              </p>
            </div>

            <div
              style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("roles")}
            >
              <h4 style={{ marginBottom: 8 }}>Roles</h4>
              <p style={styles.text}>
                Create new system roles and see every role currently available.
              </p>
            </div>

            <div
              style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("features")}
            >
              <h4 style={{ marginBottom: 8 }}>Feature Toggles</h4>
              <p style={styles.text}>
                Turn features on or off system-wide, with an optional expiry date.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------- SCHOOLS ---------------------- */}
      {selectedSection === "schools" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Create School</h3>

            <p style={{ marginBottom: 16, color: "#475569" }}>
              Onboard a new school. A unique school code is generated automatically —
              share it with the school so their owner/staff/parents can register
              against it.
            </p>

            <form
              onSubmit={createSchool}
              style={{ display: "flex", gap: 10, alignItems: "flex-start", maxWidth: 500 }}
            >
              <input
                placeholder="School name"
                value={newSchoolName}
                onChange={e => setNewSchoolName(e.target.value)}
                required
                style={{ ...styles.input, flex: 1 }}
              />
              <button style={styles.actionBtn}>Create School</button>
            </form>

            {lastCreatedSchoolCode && (
              <p style={{ marginTop: 12, color: "#16a34a", fontWeight: 600 }}>
                School created — code: {lastCreatedSchoolCode}
              </p>
            )}
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Existing Schools</h3>

            <div style={{ overflowX: "auto" }}>
              <table style={{ ...styles.table, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Name</th>
                    <th style={{ textAlign: "left" }}>School Code</th>
                    <th style={{ textAlign: "left" }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>
                        <code style={{ background: "#e5e7eb", padding: "2px 8px", borderRadius: 6 }}>
                          {s.school_code}
                        </code>
                      </td>
                      <td>{formatDate(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CLASS MANAGEMENT */}
      {selectedSection === "class" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* CREATE CLASS */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Create Class</h3>

            <form
              onSubmit={createClass}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                maxWidth: 500
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>School</label>
                <select
                  value={newClassSchoolId}
                  onChange={e => setNewClassSchoolId(e.target.value)}
                  required
                  style={styles.input}
                >
                  <option value="">Choose a school</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Class Name</label>
                <input
                  placeholder="Enter class name"
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Class Code</label>
                <input
                  placeholder="e.g. 7A"
                  value={newClassCode}
                  onChange={e => setNewClassCode(e.target.value)}
                  required
                  style={styles.input}
                />
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  The selected school's code is added automatically as a prefix (e.g. "7A" becomes "SCHOOLCODE-7A").
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Year Group</label>
                <input
                  placeholder="Enter year group"
                  value={newClassYearGroup}
                  onChange={e => setNewClassYearGroup(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Description</label>
                <textarea
                  placeholder="Enter class description"
                  value={newClassDescription}
                  onChange={e => setNewClassDescription(e.target.value)}
                  rows={3}
                  style={{
                    ...styles.input,
                    resize: "vertical",
                    paddingTop: 10
                  }}
                />
              </div>

              <button style={{ ...styles.actionBtn, marginTop: 8 }}>
                Create Class
              </button>
            </form>
          </div>

          {/* EXISTING CLASSES */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Existing Classes</h3>

            <SearchSort
              search={search.class}
              onSearch={v => setSearch({ ...search, class: v })}
              sort={sort.class}
              onSort={v => setSort({ ...sort, class: v })}
            />

            <div style={{ overflowX: "auto" }}>
              <table style={{ ...styles.table, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>School</th>
                    <th style={{ textAlign: "left" }}>Class Name</th>
                    <th style={{ textAlign: "left" }}>Class Code</th>
                    <th style={{ textAlign: "left" }}>Year Group</th>
                    <th style={{ textAlign: "left" }}>Description</th>
                    <th style={{ textAlign: "center", width: 120 }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginate(
                    sortData(
                      classes.filter((c: any) =>
                        (
                          `${c?.class_name || ""} ${c?.year_group || ""} ${c?.class_code || ""} ${c?.school_name || ""}`
                        )
                          .toLowerCase()
                          .includes(search.class.toLowerCase())
                      ),
                      "class_name",
                      sort.class
                    ),
                    page.class,
                    PAGE_SIZE
                  ).map((c: any) => (
                    <tr key={c.id}>
                      <td>{c.school_name || "—"}</td>
                      <td>{c.class_name}</td>
                      <td>{c.class_code || "—"}</td>
                      <td>{c.year_group || "—"}</td>
                      <td>{c.description || "—"}</td>

                      <td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => handleDeleteClass(c.id)}
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
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page.class}
              setPage={n => setPage({ ...page, class: n })}
              pageSize={PAGE_SIZE}
              total={
                classes.filter((c: any) =>
                  (
                    `${c?.class_name || ""} ${c?.year_group || ""} ${c?.class_code || ""} ${c?.school_name || ""}`
                  )
                    .toLowerCase()
                    .includes(search.class.toLowerCase())
                ).length
              }
            />
          </div>

          {/* EDIT CLASS DETAILS */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Edit Class Details</h3>

            <div style={{ overflowX: "auto" }}>
              <table style={{ ...styles.table, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Class Name</th>
                    <th style={{ textAlign: "left" }}>Class Code</th>
                    <th style={{ textAlign: "left" }}>Year Group</th>
                    <th style={{ textAlign: "left" }}>Description</th>
                    <th style={{ textAlign: "center", width: 120 }}>Edit</th>
                  </tr>
                </thead>

                <tbody>
                  {classes.map((c: any) => (
                    <React.Fragment key={c.id}>
                      <tr>
                        <td>{c.class_name}</td>
                        <td>{c.class_code || "—"}</td>
                        <td>{c.year_group || "—"}</td>
                        <td>{c.description || "—"}</td>

                        <td style={{ textAlign: "center" }}>
                          <button
                            onClick={() => {
                              const prefix = `${c.school_code}-`;
                              setEditingClass({
                                ...c,
                                class_code: c.class_code?.startsWith(prefix)
                                  ? c.class_code.slice(prefix.length)
                                  : c.class_code
                              });
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
                            Edit
                          </button>
                        </td>
                      </tr>

                      {editingClass?.id === c.id && (
                        <tr>
                          <td colSpan={5}>
                            <div
                              style={{
                                marginTop: 16,
                                padding: 20,
                                background: "#f8fafc",
                                borderRadius: 10,
                                border: "1px solid #e2e8f0"
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 12
                                }}
                              >
                                <label style={{ fontWeight: 600 }}>Class Name</label>
                                <input
                                  value={editingClass.class_name}
                                  onChange={e =>
                                    setEditingClass({
                                      ...editingClass,
                                      class_name: e.target.value
                                    })
                                  }
                                  style={styles.input}
                                />

                                <label style={{ fontWeight: 600 }}>Class Code</label>
                                <input
                                  value={editingClass.class_code || ""}
                                  onChange={e =>
                                    setEditingClass({
                                      ...editingClass,
                                      class_code: e.target.value
                                    })
                                  }
                                  style={styles.input}
                                />
                                <span style={{ fontSize: 12, color: "#64748b", marginTop: -6 }}>
                                  School code prefix is added automatically — enter only the part after it.
                                </span>

                                <label style={{ fontWeight: 600 }}>Year Group</label>
                                <input
                                  value={editingClass.year_group || ""}
                                  onChange={e =>
                                    setEditingClass({
                                      ...editingClass,
                                      year_group: e.target.value
                                    })
                                  }
                                  style={styles.input}
                                />

                                <label style={{ fontWeight: 600 }}>Description</label>
                                <textarea
                                  value={editingClass.description || ""}
                                  onChange={e =>
                                    setEditingClass({
                                      ...editingClass,
                                      description: e.target.value
                                    })
                                  }
                                  rows={3}
                                  style={{ ...styles.input, resize: "vertical" }}
                                />

                                <div
                                  style={{
                                    display: "flex",
                                    gap: 12,
                                    marginTop: 10
                                  }}
                                >
                                  <button
                                    onClick={saveClassChanges}
                                    style={{
                                      background: "#16a34a",
                                      color: "white",
                                      border: "none",
                                      padding: "8px 16px",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      fontSize: 14
                                    }}
                                  >
                                    Save Changes
                                  </button>

                                  <button
                                    onClick={() => setEditingClass(null)}
                                    style={{
                                      background: "#64748b",
                                      color: "white",
                                      border: "none",
                                      padding: "8px 16px",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      fontSize: 14
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ASSIGN STUDENT TO CLASS */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Assign Student to Class</h3>

            <form
              onSubmit={assignStudentToClass}
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
                  value={assignStudentClassId}
                  onChange={e => setAssignStudentClassId(e.target.value)}
                  style={styles.input}
                >
                  <option value="">Choose a class</option>
                  {classes.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.class_name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>
                  Select Student
                </label>
                <select
                  value={assignStudentId}
                  onChange={e => setAssignStudentId(e.target.value)}
                  style={styles.input}
                >
                  <option value="">Choose a student</option>
                  {studentsParents.map((s: any) => (
                    <option key={s.student_id} value={s.student_id}>
                      {s.student_first_name} {s.student_last_name}
                    </option>
                  ))}
                </select>
              </div>

              <button style={{ ...styles.actionBtn, marginTop: 8 }}>
                Assign Student
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TEACHER MANAGEMENT */}
      {selectedSection === "teacher" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
                  {classes.map((c: any) => (
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
                  {teachers.map((t: any) => (
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

            <SearchSort
              search={search.teacher}
              onSearch={v => setSearch({ ...search, teacher: v })}
              sort={sort.teacher}
              onSort={v => setSort({ ...sort, teacher: v })}
            />

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
                  {paginate(
                    sortData(
                      teachers.filter((t: any) =>
                        ((t?.username as string) || "")
                          .toLowerCase()
                          .includes(search.teacher.toLowerCase())
                      ),
                      "username",
                      sort.teacher
                    ),
                    page.teacher,
                    PAGE_SIZE
                  ).map((t: any) => {
                    const assigned = t.assigned_classes || [];

                    if (assigned.length === 0) {
                      return (
                        <tr key={t.id}>
                          <td>{t.username}</td>
                          <td>{t.email || "—"}</td>
                          <td>—</td>

                          <td style={{ textAlign: "center" }}>
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

                    return assigned.map((cls: any) => (
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

            <Pagination
              page={page.teacher}
              setPage={n => setPage({ ...page, teacher: n })}
              pageSize={PAGE_SIZE}
              total={
                teachers.filter((t: any) =>
                  ((t?.username as string) || "")
                    .toLowerCase()
                    .includes(search.teacher.toLowerCase())
                ).length
              }
            />
          </div>
        </div>
      )}

      {/* STUDENT & PARENT OVERVIEW */}
      {selectedSection === "sp" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Student & Parent Overview</h3>

            <SearchSort
              search={search.sp}
              onSearch={v => setSearch({ ...search, sp: v })}
              sort={sort.sp}
              onSort={v => setSort({ ...sort, sp: v })}
            />

            <div style={{ overflowX: "auto" }}>
              <table style={{ ...styles.table, width: "100%", maxWidth: "900px" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Student Name</th>
                    <th style={{ textAlign: "left" }}>Date of Birth</th>
                    <th style={{ textAlign: "left" }}>Class</th>
                    <th style={{ textAlign: "center", width: 120 }}>View Details</th>
                  </tr>
                </thead>

                <tbody>
                  {paginate(
                    sortData(
                      studentsParents.filter((row: any) =>
                        (
                          `${row?.student_first_name || ""} ${
                            row?.student_last_name || ""
                          }`
                        )
                          .toLowerCase()
                          .includes(search.sp.toLowerCase())
                      ),
                      "student_first_name",
                      sort.sp
                    ),
                    page.sp,
                    PAGE_SIZE
                  ).map((row: any) => {
                    const studentId = row.student_id;
                    const isExpanded = !!expandedStudents[studentId];

                    const studentAddress = [
                      row.student_address1,
                      row.student_address2,
                      row.student_address3
                    ]
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <React.Fragment key={studentId}>
                        <tr>
                          <td>
                            <strong>
                              {row.student_first_name} {row.student_last_name}
                            </strong>
                          </td>

                          <td>{formatDate(row.student_date_of_birth)}</td>

                          <td>{row.class_name || "—"}</td>

                          <td style={{ textAlign: "center" }}>
                            <button
                              style={styles.secondaryBtn}
                              onClick={() =>
                                setExpandedStudents(prev => ({
                                  ...prev,
                                  [studentId]: !prev[studentId]
                                }))
                              }
                            >
                              {isExpanded ? "▼ Hide" : "▶ View"}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={3}>
                              <div
                                style={{
                                  width: "100%",
                                  maxWidth: "900px",
                                  margin: "0 auto",
                                  padding: 24,
                                  background: "#f8f7ff",
                                  borderRadius: 14,
                                  marginTop: 10,
                                  border: "2px solid #e2d9ff",
                                  fontSize: 15,
                                  lineHeight: "1.7"
                                }}
                              >
                                <div style={{ marginBottom: 20 }}>
                                  <h4
                                    style={{
                                      fontSize: 18,
                                      marginBottom: 10,
                                      color: "#4c1d95"
                                    }}
                                  >
                                    Student Details
                                  </h4>

                                  <div>
                                    <strong>Gender:</strong>{" "}
                                    {row.student_gender || "—"}
                                  </div>
                                  <div>
                                    <strong>Address:</strong>{" "}
                                    {studentAddress || "—"}
                                  </div>
                                  <div>
                                    <strong>City:</strong>{" "}
                                    {row.student_city || "—"}
                                  </div>
                                  <div>
                                    <strong>Postcode:</strong>{" "}
                                    {row.student_postcode || "—"}
                                  </div>
                                  <div>
                                    <strong>Medical Condition:</strong>{" "}
                                    {row.student_medical_condition || "—"}
                                  </div>
                                </div>

                                <hr style={{ margin: "20px 0" }} />

                                <div>
                                  <h4
                                    style={{
                                      fontSize: 18,
                                      marginBottom: 10,
                                      color: "#4c1d95"
                                    }}
                                  >
                                    Parent Details
                                  </h4>

                                  <div>
                                    <strong>Name:</strong>{" "}
                                    {row.parent_first_name}{" "}
                                    {row.parent_last_name}
                                  </div>
                                  <div>
                                    <strong>Email:</strong> {row.parent_email}
                                  </div>
                                  <div>
                                    <strong>Relationship:</strong>{" "}
                                    {row.parent_relationship || "—"}
                                  </div>
                                  <div>
                                    <strong>Phone Number:</strong>{" "}
                                    {row.parent_contact_number || "—"}
                                  </div>
                                  <div>
                                    <strong>Medical Notes:</strong>{" "}
                                    {row.parent_medical_condition || "—"}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page.sp}
              setPage={n => setPage({ ...page, sp: n })}
              pageSize={PAGE_SIZE}
              total={
                studentsParents.filter((row: any) =>
                  (
                    `${row?.student_first_name || ""} ${
                      row?.student_last_name || ""
                    }`
                  )
                    .toLowerCase()
                    .includes(search.sp.toLowerCase())
                ).length
              }
            />
          </div>
        </div>
      )}

      {/* APPROVALS */}
      {selectedSection === "approvals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Pending User Approvals</h3>

            <SearchSort
              search={search.pending}
              onSearch={v => setSearch({ ...search, pending: v })}
              sort={sort.pending}
              onSort={v => setSort({ ...sort, pending: v })}
            />

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
                    <th style={{ textAlign: "left" }}>School</th>
                    <th style={{ textAlign: "center", width: 140 }}>Select Role</th>
                    <th style={{ textAlign: "center", width: 200 }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginate(
                    sortData(
                      pendingUsers.filter((u: any) =>
                        ((u?.username as string) || "")
                          .toLowerCase()
                          .includes(search.pending.toLowerCase())
                      ),
                      "username",
                      sort.pending
                    ),
                    page.pending,
                    PAGE_SIZE
                  ).map((u: any) => (
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

                      <td>{u.requested_role === "staff" ? u.school_name || "—" : "—"}</td>

                      <td style={{ textAlign: "center" }}>
                        {u.requested_role === "parent" ? (
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

                        {u.requested_role === "parent" ? (
                          <span style={{ fontSize: 12, color: "#64748b" }}>
                            Handled by school admin/owner
                          </span>
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

            <Pagination
              page={page.pending}
              setPage={n => setPage({ ...page, pending: n })}
              pageSize={PAGE_SIZE}
              total={
                pendingUsers.filter((u: any) =>
                  ((u?.username as string) || "")
                    .toLowerCase()
                    .includes(search.pending.toLowerCase())
                ).length
              }
            />
          </div>
        </div>
      )}

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

      {/* REMOVE USERS */}
      {selectedSection === "remove" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Remove Students & Parents</h3>

            <SearchSort
              search={searchRemove}
              onSearch={v => setSearchRemove(v)}
              sort={sort.sp}
              onSort={v => setSort({ ...sort, sp: v })}
            />

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
                  {studentsParents
                    .filter((row: any) =>
                      (
                        `${row.student_first_name} ${row.student_last_name} ${row.parent_first_name} ${row.parent_last_name}`
                      )
                        .toLowerCase()
                        .includes(searchRemove.toLowerCase())
                    )
                    .map((row: any) => (
                      <tr key={row.student_id}>
                        <td>
                          <strong>
                            {row.student_first_name} {row.student_last_name}
                          </strong>
                        </td>

                        <td>
                          {row.parent_first_name} {row.parent_last_name}
                        </td>

                        <td>{row.parent_contact_number || "—"}</td>

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

                          <button
                            onClick={() => handleRemoveParent(row.parent_id)}
                            style={{
                              background: "#b91c1c",
                              color: "white",
                              border: "none",
                              padding: "6px 8px",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 14
                            }}
                          >
                            Remove Parent
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------- ALL USERS ---------------------- */}
      {selectedSection === "users" && (
        <div style={styles.card}>
          <h3>All Users</h3>
          <p style={{ marginBottom: 16, color: "#475569" }}>
            View, edit, grant roles to, or delete any user in the system.
          </p>

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
                  <th style={{ textAlign: "center", width: 320 }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginate(
                  sortData(
                    users.filter((u: any) =>
                      u.username.toLowerCase().includes(searchUsers.toLowerCase())
                    ),
                    "username",
                    sortUsers
                  ),
                  pageUsers,
                  USERS_PAGE_SIZE
                ).map((u: any) => (
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
                              minWidth: 130
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

                          {/* VIEW & EDIT — HIDDEN FOR STUDENT USERS */}
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
                                padding: "6px 10px",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontSize: 13
                              }}
                            >
                              View & Edit
                            </button>
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
                              fontSize: 13
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
                            u.students.some((s: any) => s && s.first_name) && (
                              <div style={{ marginTop: 30 }}>
                                <h3 style={{ marginBottom: 12 }}>Student(s)</h3>

                                {u.students
                                  .filter((s: any) => s && s.first_name)
                                  .map((s: any, idx: number) => (
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
            pageSize={USERS_PAGE_SIZE}
            total={
              users.filter((u: any) =>
                u.username.toLowerCase().includes(searchUsers.toLowerCase())
              ).length
            }
          />
        </div>
      )}

      {/* ---------------------- ROLES ---------------------- */}
      {selectedSection === "roles" && (
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

      {/* ---------------------- FEATURE TOGGLES ---------------------- */}
      {selectedSection === "features" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Create Feature Toggle</h3>

            <p style={{ marginBottom: 16, color: "#475569" }}>
              Add a new feature switch. Set an expiry date to automatically revert
              it back to its default state once that date passes.
            </p>

            <form
              onSubmit={createFeatureFlag}
              style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Feature Key</label>
                <input
                  placeholder="e.g. new_attendance_ui"
                  value={newFlagKey}
                  onChange={e => setNewFlagKey(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Display Name</label>
                <input
                  placeholder="e.g. New Attendance UI"
                  value={newFlagName}
                  onChange={e => setNewFlagName(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Description</label>
                <textarea
                  placeholder="What does this feature control?"
                  value={newFlagDescription}
                  onChange={e => setNewFlagDescription(e.target.value)}
                  rows={3}
                  style={{ ...styles.input, resize: "vertical", paddingTop: 10 }}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "#334155" }}>
                <input
                  type="checkbox"
                  checked={newFlagDefaultEnabled}
                  onChange={e => setNewFlagDefaultEnabled(e.target.checked)}
                />
                Enabled by default
              </label>

              <button style={{ ...styles.actionBtn, marginTop: 8 }}>
                Create Feature
              </button>
            </form>
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Features</h3>

            {featureFlags.length === 0 ? (
              <p style={styles.text}>No feature toggles have been created yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...styles.table, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Feature</th>
                      <th style={{ textAlign: "left" }}>Per-School Access</th>
                      <th style={{ textAlign: "left" }}>Expires</th>
                      <th style={{ textAlign: "center", width: 120 }}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {featureFlags.map(flag => {
                      const expiryDraft =
                        flagExpiryDrafts[flag.id] ?? toDatetimeLocal(flag.expires_at);

                      return (
                        <tr key={flag.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{flag.name}</div>
                            <div style={{ fontSize: 13, color: "#64748b" }}>{flag.feature_key}</div>
                            {flag.description && (
                              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                                {flag.description}
                              </div>
                            )}
                            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                              Default for schools with no override: {flag.default_enabled ? "On" : "Off"}
                            </div>
                          </td>

                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260 }}>
                              {schools.map(s => {
                                const override = featureFlagOverrides.find(
                                  o => o.feature_flag_id === flag.id && o.school_id === s.id
                                );
                                const effectiveEnabled = override
                                  ? !!override.enabled
                                  : !!flag.default_enabled;

                                return (
                                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 13, minWidth: 120 }}>{s.name}</span>
                                    <span
                                      style={{
                                        padding: "2px 8px",
                                        borderRadius: 8,
                                        fontWeight: 600,
                                        fontSize: 12,
                                        background: effectiveEnabled ? "#dcfce7" : "#fee2e2",
                                        color: effectiveEnabled ? "#166534" : "#991b1b"
                                      }}
                                    >
                                      {effectiveEnabled ? "On" : "Off"}
                                    </span>
                                    <button
                                      onClick={() => setSchoolFeature(flag.id, s.id, !effectiveEnabled)}
                                      style={{
                                        background: effectiveEnabled ? "#dc2626" : "#16a34a",
                                        color: "white",
                                        border: "none",
                                        padding: "3px 10px",
                                        borderRadius: 6,
                                        cursor: "pointer",
                                        fontSize: 12
                                      }}
                                    >
                                      {effectiveEnabled ? "Disable" : "Enable"}
                                    </button>
                                    {override && (
                                      <button
                                        onClick={() => resetSchoolFeature(flag.id, s.id)}
                                        style={{
                                          background: "transparent",
                                          color: "#64748b",
                                          border: "1px solid #cbd5e1",
                                          padding: "3px 10px",
                                          borderRadius: 6,
                                          cursor: "pointer",
                                          fontSize: 12
                                        }}
                                      >
                                        Reset
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>

                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <input
                                type="datetime-local"
                                value={expiryDraft}
                                onChange={e =>
                                  setFlagExpiryDrafts(prev => ({
                                    ...prev,
                                    [flag.id]: e.target.value
                                  }))
                                }
                                style={{ ...styles.input, minWidth: 200 }}
                              />
                              <button
                                onClick={() => saveFeatureFlagExpiry(flag)}
                                style={{ ...styles.secondaryBtn, alignSelf: "flex-start" }}
                              >
                                Save Expiry
                              </button>
                            </div>
                          </td>

                          <td style={{ textAlign: "center" }}>
                            <button
                              onClick={() => deleteFeatureFlag(flag)}
                              style={{
                                background: "#64748b",
                                color: "white",
                                border: "none",
                                padding: "6px 12px",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontSize: 14,
                                width: "100%"
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------- NOTIFICATIONS ---------------------- */}
      {selectedSection === "notifications" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Send Notification</h3>

            <form
              onSubmit={sendNotification}
              style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>School</label>
                <select
                  value={notificationSchoolId}
                  onChange={e => setNotificationSchoolId(e.target.value)}
                  required
                  style={styles.input}
                >
                  <option value="">Choose a school</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {notificationSchoolId && !isFlagEnabledForSchool("notifications", Number(notificationSchoolId)) && (
                <p style={{ fontSize: 13, color: "#991b1b", background: "#fee2e2", padding: "8px 12px", borderRadius: 8 }}>
                  The notifications feature is currently off for this school. Enable it under Feature
                  Toggles before sending.
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Send To</label>
                <select
                  value={notificationAudience}
                  onChange={e => setNotificationAudience(e.target.value)}
                  required
                  style={styles.input}
                >
                  <option value="">Choose an audience</option>
                  <option value="parent">Parents only</option>
                  <option value="staff">Staff only</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Title</label>
                <input
                  placeholder="Enter a title"
                  value={notificationTitle}
                  onChange={e => setNotificationTitle(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Message</label>
                <textarea
                  placeholder="Enter the notification message"
                  value={notificationMessage}
                  onChange={e => setNotificationMessage(e.target.value)}
                  required
                  rows={4}
                  style={{ ...styles.input, resize: "vertical", paddingTop: 10 }}
                />
              </div>

              <button
                style={{ ...styles.actionBtn, marginTop: 8 }}
                disabled={
                  !!notificationSchoolId &&
                  !isFlagEnabledForSchool("notifications", Number(notificationSchoolId))
                }
              >
                Send Notification
              </button>
            </form>
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Sent Notifications</h3>

            {sentNotifications.length === 0 ? (
              <p style={styles.text}>No notifications have been sent yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...styles.table, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Sent</th>
                      <th style={{ textAlign: "left" }}>School</th>
                      <th style={{ textAlign: "left" }}>Audience</th>
                      <th style={{ textAlign: "left" }}>Title</th>
                      <th style={{ textAlign: "left" }}>Message</th>
                      <th style={{ textAlign: "center" }}>Recipients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentNotifications.map((n: any) => (
                      <tr key={n.id}>
                        <td>{formatDate(n.created_at)}</td>
                        <td>{n.school_name}</td>
                        <td>{n.audience === "parent" ? "Parents" : "Staff"}</td>
                        <td>{n.title}</td>
                        <td>{n.message}</td>
                        <td style={{ textAlign: "center" }}>{n.recipient_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </BaseDashboard>
  );
};

export default SystemAdminDashboard;
