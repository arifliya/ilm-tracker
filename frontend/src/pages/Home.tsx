import React from "react";
import { Link } from "react-router-dom";
import { publicStyles as styles } from "../styles/publicStyles";

const Home: React.FC = () => {
  return (
    <div style={styles.pageCentered}>
      <div style={styles.card}>
        <h1 style={styles.title}>ilm School Portal</h1>

        <p style={styles.text}>
          A simple and secure platform for managing school operations.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Link to="/login" style={styles.actionBtn}>
            Login
          </Link>

          <Link to="/register" style={styles.secondaryBtn}>
            Register
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;
