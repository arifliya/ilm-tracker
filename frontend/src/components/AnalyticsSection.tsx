import React, { useContext, useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";
import { AuthContext } from "../AuthContext";
import LineChart from "./charts/LineChart";
import BarChart from "./charts/BarChart";

interface AnalyticsData {
  attendanceTrend: {
    range: "term" | "year";
    rangeStart: string;
    rangeEnd: string;
    termName: string | null;
    points: { date: string; rate: number | null }[];
  };
  studentsPerClass: { classId: number; className: string; studentCount: number }[];
  feesTrend: {
    range: "month" | "year";
    points: { label: string; collected: number; outstanding: number }[];
  } | null;
}

// Shared between AdminDashboard and OwnerDashboard — identical functionality
// for both roles, except the "Fees Collected" chart, which only ever showed
// for admin (Owner's dashboard has no fee-tracking nav at all, regardless of
// the school's "fees" flag) — gated on the logged-in user's own role here
// instead of a prop, so this stays true for whichever dashboard mounts it.
const AnalyticsSection: React.FC = () => {
  const { user } = useContext(AuthContext);

  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [attendanceRange, setAttendanceRange] = useState<"term" | "year">("term");
  const [feesRange, setFeesRange] = useState<"month" | "year">("month");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/features")
      .then(res => setFeatures(res.data?.flags || {}))
      .catch(err => console.error("Failed to load features", err));
  }, []);

  const loadAnalytics = async (range: "term" | "year", feesRangeParam: "month" | "year") => {
    setAnalyticsLoading(true);
    try {
      const res = await api.get("/admin/analytics", { params: { range, feesRange: feesRangeParam } });
      setAnalyticsData(res.data);
      setError(null);
    } catch (err) {
      console.error("Load analytics error:", err);
      setError(getErrorMessage(err, "Failed to load analytics"));
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics(attendanceRange, feesRange);
  }, [attendanceRange, feesRange]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Attendance Trend</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{
                ...styles.secondaryBtn,
                ...(attendanceRange === "term" ? { background: "#2a78d6", color: "#fff" } : {})
              }}
              onClick={() => setAttendanceRange("term")}
            >
              Term
            </button>
            <button
              style={{
                ...styles.secondaryBtn,
                ...(attendanceRange === "year" ? { background: "#2a78d6", color: "#fff" } : {})
              }}
              onClick={() => setAttendanceRange("year")}
            >
              Year
            </button>
          </div>
        </div>

        {analyticsLoading || !analyticsData ? (
          <p style={styles.text}>Loading analytics...</p>
        ) : (
          <LineChart
            title={
              attendanceRange === "year"
                ? "Attendance rate — last 12 months"
                : analyticsData.attendanceTrend.termName
                ? `Attendance rate — ${analyticsData.attendanceTrend.termName}`
                : "Attendance rate — last 30 days"
            }
            emptyMessage="No attendance recorded yet in this range."
            points={analyticsData.attendanceTrend.points.map(p => ({ x: p.date, y: p.rate }))}
          />
        )}
      </div>

      <div style={styles.card}>
        {analyticsLoading || !analyticsData ? (
          <p style={styles.text}>Loading analytics...</p>
        ) : (
          <BarChart
            title="Students per class"
            emptyMessage="No classes yet."
            data={analyticsData.studentsPerClass.map(c => ({ label: c.className, value: c.studentCount }))}
          />
        )}
      </div>

      {features.fees && user?.role === "admin" && (
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Fees Collected</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{
                  ...styles.secondaryBtn,
                  ...(feesRange === "month" ? { background: "#2a78d6", color: "#fff" } : {})
                }}
                onClick={() => setFeesRange("month")}
              >
                Month
              </button>
              <button
                style={{
                  ...styles.secondaryBtn,
                  ...(feesRange === "year" ? { background: "#2a78d6", color: "#fff" } : {})
                }}
                onClick={() => setFeesRange("year")}
              >
                Year
              </button>
            </div>
          </div>

          {analyticsLoading || !analyticsData || !analyticsData.feesTrend ? (
            <p style={styles.text}>Loading analytics...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <BarChart
                title={feesRange === "year" ? "Collected — by year" : "Collected — by fee period"}
                emptyMessage="No fee periods yet."
                data={analyticsData.feesTrend.points.map(p => ({ label: p.label, value: p.collected }))}
                valueFormat={v => `£${v.toFixed(2)}`}
              />
              <BarChart
                title={feesRange === "year" ? "Outstanding — by year" : "Outstanding — by fee period"}
                emptyMessage="No fee periods yet."
                data={analyticsData.feesTrend.points.map(p => ({ label: p.label, value: p.outstanding }))}
                valueFormat={v => `£${v.toFixed(2)}`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalyticsSection;
