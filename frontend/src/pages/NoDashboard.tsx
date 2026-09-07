import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../api";
import { publicStyles as styles } from "../styles/publicStyles";
import { formatDate } from "../utils/formatDate";

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  sender_first_name: string;
  sender_last_name: string;
}

const NoDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    api
      .get("/notifications")
      .then(res => setNotifications(res.data || []))
      .catch(err => console.error("Failed to load notifications:", err));
  }, []);

  const markNotificationRead = async (id: number) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    );
    try {
      await api.post(`/notifications/${id}/read`);
    } catch (err) {
      console.error("Mark notification read error:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error("Logout failed:", err);
    }
    navigate("/login");
  };

  return (
    <div style={{ ...styles.page, display: "flex", justifyContent: "center" }}>
      <div style={{ ...styles.card, maxWidth: 640, textAlign: "left" }}>
        <h2 style={{ ...styles.title, textAlign: "center" }}>No Dashboard Available</h2>

        <p style={{ ...styles.text, textAlign: "center" }}>
          Your account has the role <strong>{user?.role}</strong>, which doesn't
          have a dashboard configured yet.
        </p>

        <p style={{ ...styles.text, textAlign: "center" }}>
          Please contact a system administrator so they can set one up for you.
        </p>

        <button style={{ ...styles.logoutBtn, display: "block", margin: "0 auto 24px" }} onClick={handleLogout}>
          Logout
        </button>

        {notifications.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ ...styles.sectionTitle, marginBottom: 12 }}>Notifications</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {notifications.map((n) => {
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
                    <div style={{ marginTop: 6, color: "#444" }}>{n.message}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
                      From {n.sender_first_name} {n.sender_last_name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NoDashboard;
