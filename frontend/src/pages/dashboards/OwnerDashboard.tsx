import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { dashboardStyles as styles } from "../../styles/dashboardStyles";
import BaseDashboard, { DashboardNavItem } from "../../components/BaseDashboard";
import { getErrorMessage } from "../../utils/getErrorMessage";
import ClassManagementSection from "../../components/ClassManagementSection";
import TeacherDirectorySection from "../../components/TeacherDirectorySection";
import StudentParentOverviewSection from "../../components/StudentParentOverviewSection";
import ApprovalsSection from "../../components/ApprovalsSection";
import RemoveUsersSection from "../../components/RemoveUsersSection";
import AllUsersSection from "../../components/AllUsersSection";
import AttendanceReportSection from "../../components/AttendanceReportSection";
import DashboardNotificationsSection from "../../components/DashboardNotificationsSection";
import TimetableSection from "../../components/TimetableSection";
import AnalyticsSection from "../../components/AnalyticsSection";
import PasswordManagementSection from "../../components/PasswordManagementSection";

type SectionKey =
  | "dashboard"
  | "class"
  | "teacher"
  | "sp"
  | "approvals"
  | "remove"
  | "users"
  | "report"
  | "notifications"
  | "timetable"
  | "analytics"
  | "passwordManagement";

const BASE_NAV_ITEMS: DashboardNavItem[] = [
  { key: "dashboard", icon: "🏠", label: "Dashboard" },
  { key: "class", icon: "📚", label: "Class Management" },
  { key: "teacher", icon: "👨‍🏫", label: "Teacher Management" },
  { key: "sp", icon: "👨‍👩‍👧", label: "Student & Parent Overview" },
  { key: "approvals", icon: "📝", label: "Approvals" },
  { key: "remove", icon: "🗑️", label: "Remove Users" },
  { key: "users", icon: "👑", label: "All Users" }
];

const SECTION_TITLES: Record<SectionKey, string> = {
  dashboard: "Dashboard",
  class: "Class Management",
  teacher: "Teacher Management",
  sp: "Student & Parent Overview",
  approvals: "Approvals",
  remove: "Remove Users",
  users: "All Users",
  report: "Attendance Report",
  notifications: "Notifications",
  timetable: "Timetable",
  analytics: "Analytics",
  passwordManagement: "Password Management"
};

// Each section below is a fully self-contained component (own state, own
// fetches, own error/success banners — see FeeTrackingSection.tsx for the
// established pattern) rather than this file owning ~70 useState hooks and
// every section's JSX inline. This file now only owns what's genuinely
// shared: which section is selected, and the feature flags that gate both
// the nav items and which section-mounts render at all.
const OwnerDashboard: React.FC = () => {
  const [selectedSection, setSelectedSection] = useState<SectionKey>("dashboard");
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadFeatures = async () => {
      try {
        const res = await api.get("/features");
        setFeatures(res.data?.flags || {});
        setLoadError(null);
      } catch (err) {
        console.error("Failed to load feature flags", err);
        setLoadError(getErrorMessage(err, "Failed to load dashboard data."));
      }
    };
    loadFeatures();
  }, []);

  let navItems = features.attendance_report
    ? [...BASE_NAV_ITEMS, { key: "report", icon: "📊", label: "Attendance Report" }]
    : BASE_NAV_ITEMS;
  if (features.notifications) {
    navItems = [...navItems, { key: "notifications", icon: "📣", label: "Notifications" }];
  }
  if (features.timetable) {
    navItems = [...navItems, { key: "timetable", icon: "🗓️", label: "Timetable" }];
  }
  if (features.analytics_dashboard) {
    navItems = [...navItems, { key: "analytics", icon: "📈", label: "Analytics" }];
  }
  if (features.password_management) {
    navItems = [...navItems, { key: "passwordManagement", icon: "🔑", label: "Password Management" }];
  }

  return (
    <BaseDashboard
      navItems={navItems}
      selectedSection={selectedSection}
      onSelectSection={key => setSelectedSection(key as SectionKey)}
      title={SECTION_TITLES[selectedSection]}
      error={loadError}
      onDismissError={() => setLoadError(null)}
    >
      {/* ---------------------- DASHBOARD SECTION ---------------------- */}
      {selectedSection === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Welcome Card */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Welcome to your Owner Dashboard</h3>

            <p style={styles.text}>
              As the Owner, you have full access to all administrative, management, and
              system‑level controls. Use this dashboard to oversee classes, teachers,
              parents, students, approvals, and high‑level system operations.
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
                Grant roles, remove roles, or delete any user account in the system.
              </p>
            </div>

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

      {selectedSection === "class" && <ClassManagementSection />}
      {selectedSection === "teacher" && <TeacherDirectorySection />}
      {selectedSection === "sp" && <StudentParentOverviewSection />}
      {selectedSection === "approvals" && <ApprovalsSection />}
      {selectedSection === "remove" && <RemoveUsersSection />}
      {selectedSection === "users" && <AllUsersSection />}
      {selectedSection === "report" && features.attendance_report && <AttendanceReportSection />}
      {selectedSection === "notifications" && features.notifications && <DashboardNotificationsSection />}
      {selectedSection === "timetable" && features.timetable && <TimetableSection />}
      {selectedSection === "analytics" && features.analytics_dashboard && <AnalyticsSection />}
      {selectedSection === "passwordManagement" && features.password_management && <PasswordManagementSection />}
    </BaseDashboard>
  );
};

export default OwnerDashboard;
