import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDate } from "../utils/formatDate";

interface SchoolItem {
  id: number;
  name: string;
  school_code: string;
  created_at: string;
}

// system_admin only — platform-wide school onboarding, so there's no other
// dashboard this could be shared with the way most other extracted
// sections are.
const SchoolsSection: React.FC = () => {
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newSchoolName, setNewSchoolName] = useState("");
  const [lastCreatedSchoolCode, setLastCreatedSchoolCode] = useState<string | null>(null);

  const loadSchools = async () => {
    try {
      const res = await api.get("/system-admin/schools");
      setSchools(res.data || []);
      setError(null);
    } catch (err) {
      console.error("Failed to load schools", err);
      setError(getErrorMessage(err, "Failed to load schools."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchools();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const createSchool = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await api.post("/system-admin/schools", { name: newSchoolName });
      setNewSchoolName("");
      setLastCreatedSchoolCode(res.data?.school_code || null);
      await loadSchools();
      setSuccess("School created successfully.");
    } catch (err) {
      console.error("Create school error:", err);
      setError(getErrorMessage(err, "Failed to create school"));
    }
  };

  if (loading) return <p style={styles.text}>Loading schools…</p>;

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
        <h3 style={{ marginBottom: 12 }}>Create School</h3>

        <p style={{ marginBottom: 16, color: "#475569" }}>
          Onboard a new school. A unique school code is generated automatically —
          share it with the school so their owner/staff/parents can register
          against it.
        </p>

        <form
          onSubmit={createSchool}
          style={{ display: "flex", gap: 10, alignItems: "flex-start", maxWidth: 500 }}
        >
          <input
            placeholder="School name"
            value={newSchoolName}
            onChange={e => setNewSchoolName(e.target.value)}
            required
            style={{ ...styles.input, flex: 1 }}
          />
          <button style={styles.actionBtn}>Create School</button>
        </form>

        {lastCreatedSchoolCode && (
          <p style={{ marginTop: 12, color: "#16a34a", fontWeight: 600 }}>
            School created — code: {lastCreatedSchoolCode}
          </p>
        )}
      </div>

      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Existing Schools</h3>

        <div style={{ overflowX: "auto" }}>
          <table style={{ ...styles.table, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Name</th>
                <th style={{ textAlign: "left" }}>School Code</th>
                <th style={{ textAlign: "left" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {schools.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <code style={{ background: "#e5e7eb", padding: "2px 8px", borderRadius: 6 }}>
                      {s.school_code}
                    </code>
                  </td>
                  <td>{formatDate(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SchoolsSection;
