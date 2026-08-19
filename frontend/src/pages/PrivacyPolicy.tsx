import React from "react";
import { Link } from "react-router-dom";
import { publicStyles as styles } from "../styles/publicStyles";

const sectionTitleStyle: React.CSSProperties = {
  ...styles.sectionTitle,
  marginTop: 24
};

const PrivacyPolicy: React.FC = () => {
  return (
    <div style={{ ...styles.page, display: "flex", justifyContent: "center" }}>
      <div style={{ ...styles.card, maxWidth: 760, textAlign: "left" }}>
        <h1 style={styles.title}>Privacy Policy</h1>
        <p style={{ ...styles.text, color: "#666" }}>Last updated: 17 August 2026</p>

        <p style={styles.text}>
          ilm School Portal ("we", "us", "the school") is committed to protecting the
          privacy of students, parents, staff, and other users of this platform. This
          policy explains what information we collect, why we collect it, and how it is
          used and protected.
        </p>

        <h2 style={sectionTitleStyle}>Information We Collect</h2>
        <p style={styles.text}>
          Depending on your role, we may collect and store: your name, date of birth,
          contact details, address, email, username, medical or disability information
          relevant to care and safeguarding, class and attendance records, and
          information relating to parent/child relationships.
        </p>

        <h2 style={sectionTitleStyle}>How We Use Your Information</h2>
        <p style={styles.text}>
          Information is used to manage school administration, including enrolment,
          class assignment, attendance tracking, safeguarding, and communication between
          the school, parents, and staff. We do not sell or share personal information
          with third parties for marketing purposes.
        </p>

        <h2 style={sectionTitleStyle}>Data Storage &amp; Security</h2>
        <p style={styles.text}>
          Data is stored securely and access is restricted to authorised staff based on
          their role within the school. Passwords are stored using industry-standard
          encryption and are never visible to staff or administrators.
        </p>

        <h2 style={sectionTitleStyle}>Your Rights</h2>
        <p style={styles.text}>
          You may request access to, correction of, or removal of your personal
          information by contacting the school office. Parents may request the same on
          behalf of their children.
        </p>

        <h2 style={sectionTitleStyle}>Data Retention</h2>
        <p style={styles.text}>
          Personal information is retained only for as long as necessary to fulfil the
          purposes described in this policy, or as required by law.
        </p>

        <h2 style={sectionTitleStyle}>Contact Us</h2>
        <p style={styles.text}>
          If you have any questions about this policy or how your data is handled,
          please contact the school office directly.
        </p>

        <div style={{ marginTop: 24 }}>
          <Link to="/" style={styles.actionBtn}>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
