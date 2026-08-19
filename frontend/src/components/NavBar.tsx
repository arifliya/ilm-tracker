import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { dashboardStyles as styles } from "../styles/dashboardStyles";

interface NavbarProps {
  onMenuClick?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { user, logout: authLogout } = useAuth();

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
      <h2 className="navbar-title" style={styles.navTitle}>ilm School Portal</h2>

      {/* RIGHT: USER + LOGOUT */}
      <div style={styles.navRight}>
        <span className="navbar-username" style={styles.navUser}>{displayName}</span>
        <button style={styles.logoutBtn} onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
};

export default Navbar;
