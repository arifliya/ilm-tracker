import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";
import { publicStyles as styles } from "../styles/publicStyles";
import { validatePassword } from "../utils/password";
import { getErrorMessage } from "../utils/getErrorMessage";

const ForcePasswordReset: React.FC = () => {
  const navigate = useNavigate();
  const { logout: authLogout, refreshUser } = useAuth();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const logout = async () => {
    try {
      await authLogout();
    } catch (err) {
      console.error("Logout failed:", err);
    }
    navigate("/login");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const strengthError = validatePassword(newPassword);
    if (strengthError) {
      setError(strengthError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/force-password-reset", { new_password: newPassword });
      await refreshUser();
      navigate("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to reset password."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        ...styles.page,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        padding: "20px"
      }}
    >
      <h2
        style={{
          ...styles.title,
          textAlign: "center",
          marginBottom: "20px",
          fontSize: "28px"
        }}
      >
        Password Reset Required
      </h2>

      <div
        style={{
          ...styles.card,
          maxWidth: "440px",
          width: "100%",
          padding: "30px 24px",
          borderRadius: "12px",
          boxShadow: "0 4px 14px rgba(0,0,0,0.08)"
        }}
      >
        <p style={{ ...styles.text, marginBottom: "20px" }}>
          Your password was reset by an administrator. Choose a new password
          before continuing — you won't be able to use the rest of the app
          until you do.
        </p>

        <form onSubmit={handleSubmit}>
          {error && <p style={{ ...styles.text, color: "#dc2626" }}>{error}</p>}

          <div style={{ marginBottom: 12 }}>
            <label style={styles.label}>New password</label>
            <input
              style={styles.input}
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoFocus
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

          <button
            type="submit"
            style={{ ...styles.homeBtn, width: "100%" }}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Set New Password"}
          </button>
        </form>

        <button
          style={{
            ...styles.logoutBtn,
            marginTop: "16px",
            width: "100%"
          }}
          onClick={logout}
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default ForcePasswordReset;
