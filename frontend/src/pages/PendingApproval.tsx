import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { publicStyles as styles } from "../styles/publicStyles";

const PendingApproval: React.FC = () => {
  const navigate = useNavigate();
  const { logout: authLogout } = useAuth();

const logout = async () => {
  try {
    await authLogout();
  } catch (err) {
    console.error("Logout failed:", err);
  }
  navigate("/login");
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
      {/* TITLE */}
      <h2
        style={{
          ...styles.title,
          textAlign: "center",
          marginBottom: "20px",
          fontSize: "28px"
        }}
      >
        Account Pending Approval
      </h2>

      {/* CARD */}
      <div
        style={{
          ...styles.card,
          maxWidth: "600px",
          textAlign: "center",
          padding: "30px 24px",
          borderRadius: "12px",
          boxShadow: "0 4px 14px rgba(0,0,0,0.08)"
        }}
      >
        <h3
          style={{
            ...styles.sectionTitle,
            marginBottom: "16px",
            fontSize: "22px"
          }}
        >
          Your account is awaiting review
        </h3>

        <p style={{ ...styles.text, marginBottom: "10px" }}>
          Your registration has been received and is currently pending approval
          by the school administration.
        </p>

        <p style={{ ...styles.text, marginBottom: "10px" }}>
          Once approved, you will automatically gain access to your dashboard
          based on your assigned role.
        </p>

        <p style={{ ...styles.text, marginBottom: "20px" }}>
          If this takes longer than expected, please contact the school office.
        </p>

        <button
          style={{
            ...styles.logoutBtn,
            marginTop: "10px",
            padding: "10px 18px",
            fontSize: "15px"
          }}
          onClick={logout}
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default PendingApproval;
