import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { api } from "../api";
import ChangePasswordModal from "./ChangePasswordModal";

interface NavbarProps {
  onMenuClick?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { user, logout: authLogout } = useAuth();
  const [passwordManagementEnabled, setPasswordManagementEnabled] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Fetched here rather than threaded down as a prop from each of the 7
  // dashboard files — this is the one place "Change Password" needs to
  // show up regardless of role.
  useEffect(() => {
    api
      .get("/features")
      .then(res => setPasswordManagementEnabled(!!res.data?.flags?.password_management))
      .catch(() => setPasswordManagementEnabled(false));
  }, []);

  const logout = async () => {
    try {
      await authLogout();
    } catch (err) {
      console.error("Logout failed:", err);
    }
    navigate("/login");
  };

  const displayName = user?.fullName || user?.username || "";

  return (
    <div style={styles.navbar}>
      {/* LEFT: MENU TOGGLE + HOME */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {onMenuClick && (
          <button
            className="dashboard-menu-toggle"
            onClick={onMenuClick}
            aria-label="Toggle menu"
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              color: "#1e293b",
              padding: 11,
              margin: -11,
              minWidth: 44,
              minHeight: 44
            }}
          >
            ☰
          </button>
        )}

        <div style={styles.navLeft} onClick={() => navigate("/")}>
          🏠
        </div>
      </div>

      {/* CENTER: TITLE */}
      <h2 className="navbar-title" style={styles.navTitle}>Ilm Tracker</h2>

      {/* RIGHT: USER + LOGOUT */}
      <div style={styles.navRight}>
        <span className="navbar-username" style={styles.navUser}>{displayName}</span>
        {passwordManagementEnabled && (
          <button style={styles.secondaryBtn} onClick={() => setShowChangePassword(true)}>
            Change Password
          </button>
        )}
        <button style={styles.logoutBtn} onClick={logout}>
          Logout
        </button>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
};

export default Navbar;
