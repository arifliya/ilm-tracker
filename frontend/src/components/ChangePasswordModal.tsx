import React, { useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";

interface ChangePasswordModalProps {
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000
};

const boxStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: 24,
  width: "90%",
  maxWidth: 400,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
};

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose }) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword
      });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to change password."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={boxStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>Change Password</h3>

        {success ? (
          <>
            <p style={{ ...styles.text, color: "#166534" }}>
              Password changed. You've been kept signed in on this device — any other logged-in
              session has been signed out.
            </p>
            <button style={styles.homeBtn} onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <p style={{ ...styles.text, color: "#dc2626" }}>{error}</p>}

            <div style={{ marginBottom: 12 }}>
              <label style={styles.label}>Current password</label>
              <input
                style={styles.input}
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={styles.label}>New password</label>
              <input
                style={styles.input}
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={styles.label}>Confirm new password</label>
              <input
                style={styles.input}
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" style={styles.secondaryBtn} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" style={styles.homeBtn} disabled={submitting}>
                {submitting ? "Saving…" : "Change Password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordModal;
