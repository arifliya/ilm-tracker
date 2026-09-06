import React, { useState } from "react";
import { dashboardStyles as styles } from "../../styles/dashboardStyles";
import BaseDashboard, { DashboardNavItem } from "../../components/BaseDashboard";
import SchoolsSection from "../../components/SchoolsSection";
import ClassManagementSection from "../../components/ClassManagementSection";
import TeacherDirectorySection from "../../components/TeacherDirectorySection";
import StudentParentOverviewSection from "../../components/StudentParentOverviewSection";
import ApprovalsSection from "../../components/ApprovalsSection";
import SystemAdminRemoveUsersSection from "../../components/SystemAdminRemoveUsersSection";
import SystemAdminAllUsersSection from "../../components/SystemAdminAllUsersSection";
import RolesSection from "../../components/RolesSection";
import FeatureFlagsSection from "../../components/FeatureFlagsSection";
import DashboardNotificationsSection from "../../components/DashboardNotificationsSection";
import OwnerPasswordResetSection from "../../components/OwnerPasswordResetSection";

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
  | "notifications"
  | "passwordManagement";

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
  { key: "notifications", icon: "📣", label: "Notifications" },
  { key: "passwordManagement", icon: "🔑", label: "Password Management" }
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
  notifications: "Notifications",
  passwordManagement: "Password Management"
};

const SystemAdminDashboard: React.FC = () => {
  const [selectedSection, setSelectedSection] = useState<SectionKey>("dashboard");

  return (
    <BaseDashboard
      navItems={NAV_ITEMS}
      selectedSection={selectedSection}
      onSelectSection={key => setSelectedSection(key as SectionKey)}
      title={SECTION_TITLES[selectedSection]}
    >
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

      {selectedSection === "schools" && <SchoolsSection />}
      {selectedSection === "class" && <ClassManagementSection />}
      {selectedSection === "teacher" && <TeacherDirectorySection />}
      {selectedSection === "sp" && <StudentParentOverviewSection />}
      {selectedSection === "approvals" && <ApprovalsSection />}
      {selectedSection === "remove" && <SystemAdminRemoveUsersSection />}
      {selectedSection === "users" && <SystemAdminAllUsersSection />}
      {selectedSection === "roles" && <RolesSection />}
      {selectedSection === "features" && <FeatureFlagsSection />}
      {selectedSection === "notifications" && <DashboardNotificationsSection />}
      {selectedSection === "passwordManagement" && <OwnerPasswordResetSection />}
    </BaseDashboard>
  );
};

export default SystemAdminDashboard;
