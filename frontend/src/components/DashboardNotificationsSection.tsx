import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDate } from "../utils/formatDate";

interface SentNotification {
  id: number;
  audience: "parent" | "staff";
  title: string;
  message: string;
  created_at: string;
  school_name: string | null;
  sender_first_name: string;
  sender_last_name: string;
  recipient_count: number;
}

interface NotificationItem {
  id: number;
  audience: "parent" | "staff";
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  sender_first_name: string;
  sender_last_name: string;
}

// Shared across every dashboard with a "Notifications" nav item (Admin,
// Owner, Maintainer, SystemAdmin) — send form, sent history, and the
// caller's own inbox were all one section originally, kept together here.
const DashboardNotificationsSection: React.FC = () => {
  const [sentNotifications, setSentNotifications] = useState<SentNotification[]>([]);
  const [myNotifications, setMyNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [notificationAudience, setNotificationAudience] = useState("");
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");

  const loadAll = async () => {
    try {
      const [sentRes, myRes] = await Promise.all([api.get("/notifications/sent"), api.get("/notifications")]);
      setSentNotifications(sentRes.data || []);
      setMyNotifications(myRes.data || []);
      setError(null);
    } catch (err) {
      console.error("Failed to load notifications", err);
      setError(getErrorMessage(err, "Failed to load notifications."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const sendNotification = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!notificationAudience) {
      setError("Please choose who this notification is for.");
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
      setSuccess(`Notification sent to ${res.data.recipientCount} recipient(s).`);
    } catch (err) {
      console.error("Send notification error:", err);
      setError(getErrorMessage(err, "Failed to send notification"));
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

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  if (loading) return <p style={styles.text}>Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", fontSize: 14 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", fontSize: 14 }}>
          {success}
        </div>
      )}

      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Send Notification</h3>

        <form onSubmit={sendNotification} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}>
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

          <button style={{ ...styles.actionBtn, marginTop: 8 }}>Send Notification</button>
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
                {sentNotifications.map(n => (
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
            {myNotifications.map(n => {
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
  );
};

export default DashboardNotificationsSection;
