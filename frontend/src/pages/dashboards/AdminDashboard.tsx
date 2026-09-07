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
import AttendanceReportSection from "../../components/AttendanceReportSection";
import DashboardNotificationsSection from "../../components/DashboardNotificationsSection";
import ReportCardsSection from "../../components/ReportCardsSection";
import TimetableSection from "../../components/TimetableSection";
import AnalyticsSection from "../../components/AnalyticsSection";
import BulkUploadSection from "../../components/BulkUploadSection";
import FeeTrackingSection from "../../components/FeeTrackingSection";
import PasswordManagementSection from "../../components/PasswordManagementSection";

type SectionKey =
  | "dashboard"
  | "class"
  | "teacher"
  | "sp"
  | "approvals"
  | "remove"
  | "report"
  | "notifications"
  | "reportCards"
  | "timetable"
  | "analytics"
  | "bulkUpload"
  | "fees"
  | "passwordManagement";

const BASE_NAV_ITEMS: DashboardNavItem[] = [
  { key: "dashboard", icon: "🏠", label: "Dashboard" },
  { key: "class", icon: "📚", label: "Class Management" },
  { key: "teacher", icon: "👨‍🏫", label: "Teacher Management" },
  { key: "sp", icon: "👨‍👩‍👧", label: "Student & Parent Overview" },
  { key: "approvals", icon: "📝", label: "Approvals" },
  { key: "remove", icon: "🗑️", label: "Remove Users" },
  { key: "bulkUpload", icon: "📤", label: "Import Students" }
];

const SECTION_TITLES: Record<SectionKey, string> = {
  dashboard: "Dashboard",
  class: "Class Management",
  teacher: "Teacher Management",
  sp: "Student & Parent Overview",
  approvals: "Approvals",
  remove: "Remove Users",
  report: "Attendance Report",
  notifications: "Notifications",
  reportCards: "Report Cards",
  timetable: "Timetable",
  analytics: "Analytics",
  bulkUpload: "Import Students",
  fees: "Fee Tracking",
  passwordManagement: "Password Management"
};

// Each section below is a fully self-contained component (own state, own
// fetches, own error/success banners — see FeeTrackingSection.tsx for the
// established pattern) rather than this file owning ~70 useState hooks and
// every section's JSX inline. This file now only owns what's genuinely
// shared: which section is selected, and the feature flags that gate both
// the nav items and which section-mounts render at all.
const AdminDashboard: React.FC = () => {
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
  if (features.report_cards) {
    navItems = [...navItems, { key: "reportCards", icon: "🎓", label: "Report Cards" }];
  }
  if (features.timetable) {
    navItems = [...navItems, { key: "timetable", icon: "🗓️", label: "Timetable" }];
  }
  if (features.analytics_dashboard) {
    navItems = [...navItems, { key: "analytics", icon: "📈", label: "Analytics" }];
  }
  if (features.fees) {
    navItems = [...navItems, { key: "fees", icon: "💰", label: "Fee Tracking" }];
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

      {selectedSection === "class" && <ClassManagementSection />}
      {selectedSection === "teacher" && <TeacherDirectorySection />}
      {selectedSection === "sp" && <StudentParentOverviewSection />}
      {selectedSection === "approvals" && <ApprovalsSection />}
      {selectedSection === "remove" && <RemoveUsersSection />}
      {selectedSection === "report" && features.attendance_report && <AttendanceReportSection />}
      {selectedSection === "notifications" && features.notifications && <DashboardNotificationsSection />}
      {selectedSection === "reportCards" && features.report_cards && <ReportCardsSection />}
      {selectedSection === "timetable" && features.timetable && <TimetableSection />}
      {selectedSection === "analytics" && features.analytics_dashboard && <AnalyticsSection />}
      {selectedSection === "bulkUpload" && <BulkUploadSection />}
      {selectedSection === "fees" && features.fees && <FeeTrackingSection />}
      {selectedSection === "passwordManagement" && features.password_management && <PasswordManagementSection />}
    </BaseDashboard>
  );
};

export default AdminDashboard;
