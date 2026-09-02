import React, { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { publicStyles as styles } from "../styles/publicStyles";
import { getErrorMessage } from "../utils/getErrorMessage";

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice] = useState(
    (location.state as { reason?: string } | null)?.reason || ""
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }

    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "Invalid credentials"));
    }
  };

  return (
    <div style={styles.pageCentered}>
      <div style={styles.card}>
        <h1 style={styles.title}>ilm School Portal</h1>
        <h2 style={styles.subtitle}>Login</h2>

        <form onSubmit={handleSubmit} style={styles.form}>
          {notice && (
            <p
              style={{
                ...styles.text,
                background: "#eff6ff",
                color: "#1d4ed8",
                border: "1px solid #bfdbfe",
                borderRadius: 8,
                padding: "10px 12px",
                marginBottom: 4
              }}
            >
              {notice}
            </p>
          )}

          <div>
            <label style={styles.text}>Username</label>
            <input
              style={styles.input}
              value={username}
              onChange={e => setUsername(e.target.value)}
              data-testid="username-input"
            />
          </div>

          <div>
            <label style={styles.text}>Password</label>
            <input
              type="password"
              style={styles.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              data-testid="password-input"
            />
          </div>

          {error && (
            <p style={{ ...styles.text, color: "red", marginTop: 8 }}>
              {error}
            </p>
          )}

          <button type="submit" style={styles.actionBtn}>
            Login
          </button>
        </form>

        <p style={{ ...styles.text, marginTop: 16 }}>
          Don’t have an account?{" "}
          <span
            style={{ color: "#2563eb", cursor: "pointer", fontWeight: 600 }}
            onClick={() => navigate("/register")}
          >
            Register
          </span>
        </p>
      </div>
    </div>
  );
};

export default Login;
