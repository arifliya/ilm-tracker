import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { downloadCsv } from "../utils/downloadCsv";
import { getErrorMessage } from "../utils/getErrorMessage";

interface ClassOption {
  id: number;
  class_name: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const oneYearAgoStr = () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Shared between AdminDashboard and OwnerDashboard — identical functionality
// for both roles, so it lives here rather than being duplicated.
const AttendanceReportSection: React.FC = () => {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [reportClassId, setReportClassId] = useState("");
  const [reportStartDate, setReportStartDate] = useState(oneYearAgoStr());
  const [reportEndDate, setReportEndDate] = useState(todayStr());
  const [reportDownloading, setReportDownloading] = useState(false);

  useEffect(() => {
    api
      .get("/admin/classes")
      .then(res => setClasses(res.data || []))
      .catch(err => {
        console.error("Failed to load classes", err);
        setError(getErrorMessage(err, "Failed to load classes."));
      });
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const downloadAttendanceReport = async () => {
    if (reportStartDate > reportEndDate) {
      setError("Start date must be before end date.");
      return;
    }

    setReportDownloading(true);
    const result = await downloadCsv(
      "/admin/attendance/report",
      {
        classId: reportClassId || undefined,
        startDate: reportStartDate,
        endDate: reportEndDate
      },
      `attendance_report_${reportStartDate}_to_${reportEndDate}.csv`
    );
    setReportDownloading(false);

    if (result.ok) {
      setSuccess("Attendance report downloaded.");
    } else {
      setError(result.message);
    }
  };

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
        <h3 style={{ marginBottom: 12 }}>Download Attendance Report</h3>

        <p style={{ marginBottom: 16, color: "#475569" }}>
          Export a CSV of class attendance. The date range can go back up to a year.
        </p>

        <div
          className="form-row"
          style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 220px" }}>
            <label className="form-row-label" style={{ fontWeight: 600 }}>Class</label>
            <select
              value={reportClassId}
              onChange={e => setReportClassId(e.target.value)}
              style={styles.input}
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.class_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
            <label className="form-row-label" style={{ fontWeight: 600 }}>Start Date</label>
            <input
              type="date"
              value={reportStartDate}
              min={oneYearAgoStr()}
              max={reportEndDate}
              onChange={e => setReportStartDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
            <label className="form-row-label" style={{ fontWeight: 600 }}>End Date</label>
            <input
              type="date"
              value={reportEndDate}
              min={reportStartDate}
              max={todayStr()}
              onChange={e => setReportEndDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <button
            style={styles.actionBtn}
            onClick={downloadAttendanceReport}
            disabled={reportDownloading}
          >
            {reportDownloading ? "Downloading…" : "Download CSV"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttendanceReportSection;
