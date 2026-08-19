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
import { downloadCsv } from "../../utils/downloadCsv";
import { usePolling } from "../../hooks/usePolling";

const PAGE_SIZE = 5;
const POLL_INTERVAL_MS = 30000;

const todayStr = () => new Date().toISOString().slice(0, 10);
const oneYearAgoStr = () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

type SectionKey = "dashboard" | "class" | "teacher" | "sp" | "approvals" | "remove" | "report" | "notifications";

const BASE_NAV_ITEMS: DashboardNavItem[] = [
  { key: "dashboard", icon: "🏠", label: "Dashboard" },
  { key: "class", icon: "📚", label: "Class Management" },
  { key: "teacher", icon: "👨‍🏫", label: "Teacher Management" },
  { key: "sp", icon: "👨‍👩‍👧", label: "Student & Parent Overview" },
  { key: "approvals", icon: "📝", label: "Approvals" },
  { key: "remove", icon: "🗑️", label: "Remove Users" }
];

const SECTION_TITLES: Record<SectionKey, string> = {
  dashboard: "Dashboard",
  class: "Class Management",
  teacher: "Teacher Management",
  sp: "Student & Parent Overview",
  approvals: "Approvals",
  remove: "Remove Users",
  report: "Attendance Report",
  notifications: "Notifications"
};

interface RoleItem {
  id: number;
  name: string;
}

const AdminDashboard: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [studentsParents, setStudentsParents] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [editingClass, setEditingClass] = useState<any | null>(null);

  const [assignStudentClassId, setAssignStudentClassId] = useState("");
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignedStudents, setAssignedStudents] = useState<any[]>([]);

  const [newClassName, setNewClassName] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [newClassYearGroup, setNewClassYearGroup] = useState("");
  const [newClassDescription, setNewClassDescription] = useState("");

  const [assignClassId, setAssignClassId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");

  const [approveRole, setApproveRole] = useState<Record<number, string>>({});
  const [viewUser, setViewUser] = useState<any | null>(null);
  const [searchRemove, setSearchRemove] = useState("");

  const [parents, setParents] = useState<any[]>([]);
  const [searchRemoveParents, setSearchRemoveParents] = useState("");

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

  const [expandedStudents, setExpandedStudents] = useState<Record<number, boolean>>({});
  const [selectedSection, setSelectedSection] = useState<SectionKey>("dashboard");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [reportClassId, setReportClassId] = useState("");
  const [reportStartDate, setReportStartDate] = useState(oneYearAgoStr());
  const [reportEndDate, setReportEndDate] = useState(todayStr());
  const [reportDownloading, setReportDownloading] = useState(false);

  const [notificationAudience, setNotificationAudience] = useState("");
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [sentNotifications, setSentNotifications] = useState<any[]>([]);
  const [myNotifications, setMyNotifications] = useState<any[]>([]);

  const { confirm, ConfirmDialog } = useConfirm();

  const loadAll = async () => {
    try {
      const [classRes, teacherRes, spRes, pendingRes, assignedRes, rolesRes, featuresRes, parentsRes, sentNotificationsRes, myNotificationsRes] =
        await Promise.all([
          api.get("/admin/classes"),
          api.get("/admin/teachers"),
          api.get("/admin/students-parents"),
          api.get("/admin/pending-users"),
          api.get("/admin/assigned-students"),
          api.get("/admin/roles"),
          api.get("/features"),
          api.get("/admin/parents"),
          api.get("/notifications/sent"),
          api.get("/notifications")
        ]);

      setClasses(classRes.data || []);
      setTeachers(teacherRes.data || []);
      setStudentsParents(spRes.data || []);
      setPendingUsers(pendingRes.data || []);
      setAssignedStudents(assignedRes.data || []);
      setSentNotifications(sentNotificationsRes.data || []);
      setMyNotifications(myNotificationsRes.data || []);
      setRoles(
        (rolesRes.data || []).filter(
          (r: RoleItem) => !["pending", "owner", "maintainer", "system_admin"].includes(r.name)
        )
      );
      setFeatures(featuresRes.data?.flags || {});
      setParents(parentsRes.data || []);
      setLoadError(null);
    } catch (err) {
      console.error("Failed to load admin data", err);
      setLoadError(getErrorMessage(err, "Failed to load dashboard data."));
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  usePolling(loadAll, POLL_INTERVAL_MS);

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/admin/classes", {
        class_name: newClassName,
        class_code: newClassCode,
        year_group: newClassYearGroup,
        description: newClassDescription
      });

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

  const downloadAttendanceReport = async () => {
    if (reportStartDate > reportEndDate) {
      setLoadError("Start date must be before end date.");
      return;
    }

    setReportDownloading(true);
    const result = await downloadCsv(
      "/admin/attendance/report",
      {
        classId: reportClassId || undefined,
        startDate: reportStartDate,
        endDate: reportEndDate
      },
      `attendance_report_${reportStartDate}_to_${reportEndDate}.csv`
    );
    setReportDownloading(false);

    if (result.ok) {
      setSuccessMessage("Attendance report downloaded.");
    } else {
      setLoadError(result.message);
    }
  };

  const sendNotification = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!notificationAudience) {
      setLoadError("Please choose who this notification is for.");
      return;
    }

    try {
      const res = await api.post("/notifications", {
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

  let navItems = features.attendance_report
    ? [...BASE_NAV_ITEMS, { key: "report", icon: "📊", label: "Attendance Report" }]
    : BASE_NAV_ITEMS;
  if (features.notifications) {
    navItems = [...navItems, { key: "notifications", icon: "📣", label: "Notifications" }];
  }

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
          {/* Welcome Card */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Welcome to your Admin Dashboard</h3>

            <p style={styles.text}>
              This is your central control panel for managing the entire school system.
              From here, you can oversee classes, teachers, students, parents, approvals,
              and system‑wide operations. Use the sidebar to navigate between modules.
            </p>

            <p style={styles.text}>
              Your dashboard gives you quick access to essential tools and insights,
              helping you keep the school running smoothly and efficiently.
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
            {/* Classes Overview */}
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

            {/* Teachers Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("teacher")}
            >
              <h4 style={{ marginBottom: 8 }}>Teachers</h4>
              <p style={styles.text}>
                View and manage teacher accounts, roles, and assigned classes.
              </p>
            </div>

            {/* Students & Parents Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("sp")}
            >
              <h4 style={{ marginBottom: 8 }}>Students & Parents</h4>
              <p style={styles.text}>
                Access student and parent information, linked accounts, and school records.
              </p>
            </div>

            {/* Approvals Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("approvals")}
            >
              <h4 style={{ marginBottom: 8 }}>Pending Approvals</h4>
              <p style={styles.text}>
                Review and approve new registrations, role changes, and account requests.
              </p>
            </div>

            {/* Attendance Report Overview */}
            {features.attendance_report && (
              <div
                style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
                onClick={() => setSelectedSection("report")}
              >
                <h4 style={{ marginBottom: 8 }}>Attendance Report</h4>
                <p style={styles.text}>
                  Download a CSV of class attendance, filtered by class and date range.
                </p>
              </div>
            )}

            {/* remove user Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("remove")}
            >
              <h4 style={{ marginBottom: 8 }}>Remove User</h4>
              <p style={styles.text}>
                Remove users account.
              </p>
            </div>

            {/* Notifications Overview */}
            {features.notifications && (
              <div
                style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
                onClick={() => setSelectedSection("notifications")}
              >
                <h4 style={{ marginBottom: 8 }}>Notifications</h4>
                <p style={styles.text}>
                  Send a notification to parents or staff, and view what's been sent.
                </p>
              </div>
            )}
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
                  Your school code is added automatically as a prefix (e.g. "7A" becomes "SCHOOLCODE-7A").
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
                        `${c?.class_name || ""} ${c?.year_group || ""} ${c?.class_code || ""}`
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
                    `${c?.class_name || ""} ${c?.year_group || ""} ${c?.class_code || ""}`
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

                    <td style={{ textAlign: "center" }}>
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
                    </td>

                    <td
                      style={{
                        textAlign: "center",
                        display: "flex",
                        gap: 8,
                        justifyContent: "center"
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
            <h3 style={{ marginBottom: 16 }}>Remove Students</h3>

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
                  <th style={{ textAlign: "center", width: 160 }}>Actions</th>
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
                            fontSize: 14
                          }}
                        >
                          Remove Student
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Own table so a parent stays reachable even after their last
              student has been removed — students-parents above is an inner
              join from students and drops childless parents entirely. */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 8 }}>Remove Parents</h3>
            <p style={{ marginBottom: 16, color: "#64748b", fontSize: 14 }}>
              A parent can only be removed once they have no students linked to their account.
            </p>

            <SearchSort
              search={searchRemoveParents}
              onSearch={v => setSearchRemoveParents(v)}
              sort={sort.sp}
              onSort={v => setSort({ ...sort, sp: v })}
            />

            <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Parent</th>
                  <th style={{ textAlign: "left" }}>Contact</th>
                  <th style={{ textAlign: "left" }}>Email</th>
                  <th style={{ textAlign: "center" }}>Students</th>
                  <th style={{ textAlign: "center", width: 160 }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {parents
                  .filter((p: any) =>
                    `${p.parent_first_name} ${p.parent_last_name}`
                      .toLowerCase()
                      .includes(searchRemoveParents.toLowerCase())
                  )
                  .map((p: any) => (
                    <tr key={p.parent_id}>
                      <td>
                        <strong>
                          {p.parent_first_name} {p.parent_last_name}
                        </strong>
                      </td>

                      <td>{p.parent_contact_number || "—"}</td>
                      <td>{p.parent_email || "—"}</td>

                      <td style={{ textAlign: "center" }}>{p.student_count}</td>

                      <td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => handleRemoveParent(p.parent_id)}
                          disabled={p.student_count > 0}
                          title={
                            p.student_count > 0
                              ? "Remove this parent's students first"
                              : undefined
                          }
                          style={{
                            background: p.student_count > 0 ? "#fca5a5" : "#b91c1c",
                            color: "white",
                            border: "none",
                            padding: "6px 8px",
                            borderRadius: 6,
                            cursor: p.student_count > 0 ? "not-allowed" : "pointer",
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

      {/* ---------------------- ATTENDANCE REPORT ---------------------- */}
      {selectedSection === "report" && features.attendance_report && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Download Attendance Report</h3>

            <p style={{ marginBottom: 16, color: "#475569" }}>
              Export a CSV of class attendance. The date range can go back up to a year.
            </p>

            <div
              className="form-row"
              style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 220px" }}>
                <label className="form-row-label" style={{ fontWeight: 600 }}>Class</label>
                <select
                  value={reportClassId}
                  onChange={e => setReportClassId(e.target.value)}
                  style={styles.input}
                >
                  <option value="">All Classes</option>
                  {classes.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.class_name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
                <label className="form-row-label" style={{ fontWeight: 600 }}>Start Date</label>
                <input
                  type="date"
                  value={reportStartDate}
                  min={oneYearAgoStr()}
                  max={reportEndDate}
                  onChange={e => setReportStartDate(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
                <label className="form-row-label" style={{ fontWeight: 600 }}>End Date</label>
                <input
                  type="date"
                  value={reportEndDate}
                  min={reportStartDate}
                  max={todayStr()}
                  onChange={e => setReportEndDate(e.target.value)}
                  style={styles.input}
                />
              </div>

              <button
                style={styles.actionBtn}
                onClick={downloadAttendanceReport}
                disabled={reportDownloading}
              >
                {reportDownloading ? "Downloading…" : "Download CSV"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------- NOTIFICATIONS ---------------------- */}
      {selectedSection === "notifications" && features.notifications && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Send Notification</h3>

            <form
              onSubmit={sendNotification}
              style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}
            >
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

              <button style={{ ...styles.actionBtn, marginTop: 8 }}>
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

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Your Notifications</h3>

            {myNotifications.length === 0 ? (
              <p style={styles.text}>You have no notifications yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {myNotifications.map((n: any) => {
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
        </div>
      )}
    </BaseDashboard>
  );
};

export default AdminDashboard;
