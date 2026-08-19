import React, { useEffect, useState } from "react";
import Navbar from "./NavBar";
import SidebarItem from "./SidebarItem";
import { dashboardStyles as styles } from "../styles/dashboardStyles";

export interface DashboardNavItem {
  key: string;
  icon: string;
  label: string;
}

interface BaseDashboardProps {
  navItems: DashboardNavItem[];
  selectedSection: string;
  onSelectSection: (key: string) => void;
  title: string;
  loading?: boolean;
  error?: string | null;
  onDismissError?: () => void;
  success?: string | null;
  onDismissSuccess?: () => void;
  children: React.ReactNode;
}

const BaseDashboard: React.FC<BaseDashboardProps> = ({
  navItems,
  selectedSection,
  onSelectSection,
  title,
  loading,
  error,
  onDismissError,
  success,
  onDismissSuccess,
  children
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (success && onDismissSuccess) {
      const timer = setTimeout(onDismissSuccess, 4000);
      return () => clearTimeout(timer);
    }
  }, [success, onDismissSuccess]);

  if (loading) {
    return <div style={{ ...styles.text, padding: 40 }}>Loading dashboard…</div>;
  }

  return (
    <div className="dashboard-shell" style={{ display: "flex", flexDirection: "column" }}>
      <Navbar onMenuClick={() => setSidebarOpen(open => !open)} />

      <div className="dashboard-body" style={{ display: "flex", flex: 1, background: "#f5f6fa" }}>
        {/* ---------------------- MOBILE SIDEBAR OVERLAY ---------------------- */}
        <div
          className={`dashboard-sidebar-overlay${sidebarOpen ? " open" : ""}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* ---------------------- SIDEBAR ---------------------- */}
        <div
          className={`dashboard-sidebar${sidebarOpen ? " open" : ""}`}
          style={{
            width: 260,
            background: "#1e293b",
            color: "white",
            paddingTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 6
          }}
        >
          {navItems.map(item => (
            <SidebarItem
              key={item.key}
              icon={item.icon}
              label={item.label}
              active={selectedSection === item.key}
              onClick={() => {
                onSelectSection(item.key);
                setSidebarOpen(false);
              }}
            />
          ))}
        </div>

        {/* ---------------------- MAIN CONTENT ---------------------- */}
        <div className="dashboard-content" style={{ flex: 1, padding: "24px 32px", overflowY: "auto", minWidth: 0 }}>
          <h2 style={{ marginBottom: 20, color: "#1e293b" }}>{title}</h2>

          {error && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                background: "#fee2e2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 20,
                fontSize: 14
              }}
            >
              <span>{error}</span>

              {onDismissError && (
                <button
                  onClick={onDismissError}
                  aria-label="Dismiss error"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#991b1b",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 0
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )}

          {success && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                background: "#dcfce7",
                color: "#166534",
                border: "1px solid #bbf7d0",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 20,
                fontSize: 14
              }}
            >
              <span>{success}</span>

              {onDismissSuccess && (
                <button
                  onClick={onDismissSuccess}
                  aria-label="Dismiss success message"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#166534",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 0
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
};

export default BaseDashboard;
