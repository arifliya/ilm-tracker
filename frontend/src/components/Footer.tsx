import React from "react";
import { Link } from "react-router-dom";

const Footer: React.FC = () => {
  return (
    <footer
      style={{
        background: "#f1f5f9",
        color: "#64748b",
        padding: "16px 20px",
        textAlign: "center",
        fontSize: 13,
        borderTop: "1px solid #e2e8f0"
      }}
    >
      <span>&copy; {new Date().getFullYear()} ilm School Portal.</span>{" "}
      <Link to="/privacy-policy" style={{ color: "#475569", textDecoration: "underline" }}>
        Privacy Policy
      </Link>
    </footer>
  );
};

export default Footer;
