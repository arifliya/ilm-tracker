import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { useConfirm } from "./ConfirmDialog";
import { getErrorMessage } from "../utils/getErrorMessage";

interface SchoolItem {
  id: number;
  name: string;
  school_code: string;
  created_at: string;
}

interface FeatureFlag {
  id: number;
  feature_key: string;
  name: string;
  description: string | null;
  default_enabled: boolean | number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FeatureFlagOverride {
  school_id: number;
  feature_flag_id: number;
  enabled: boolean | number;
}

interface FeatureFlagAuditLogEntry {
  id: number;
  feature_flag_id: number | null;
  feature_key: string;
  school_id: number | null;
  school_name: string | null;
  action: string;
  actor_username: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const describeAuditEntry = (entry: FeatureFlagAuditLogEntry) => {
  switch (entry.action) {
    case "flag_created":
      return `created the "${entry.feature_key}" flag`;
    case "flag_updated":
      return `updated the "${entry.feature_key}" flag`;
    case "flag_deleted":
      return `deleted the "${entry.feature_key}" flag`;
    case "school_override_set":
      return `${entry.details?.enabled ? "enabled" : "disabled"} "${entry.feature_key}" for ${entry.school_name || "a school"}`;
    case "school_override_cleared":
      return `reset "${entry.feature_key}" to default for ${entry.school_name || "a school"}`;
    default:
      return `${entry.action} on "${entry.feature_key}"`;
  }
};

const toDatetimeLocal = (value: string | null) => {
  if (!value) return "";
  // The API returns a full ISO string (e.g. "2026-09-01T05:30:37.571Z") for
  // TIMESTAMP columns — <input type="datetime-local"> needs
  // "YYYY-MM-DDTHH:MM". The space→T replace is a no-op on that shape; kept
  // so this also tolerates a plain "YYYY-MM-DD HH:MM:SS" value if one ever
  // reaches here some other way.
  const normalized = value.replace(" ", "T");
  return normalized.slice(0, 16);
};

// system_admin only — feature flags are platform-wide, so there's no other
// dashboard this could be shared with.
const FeatureFlagsSection: React.FC = () => {
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [featureFlagOverrides, setFeatureFlagOverrides] = useState<FeatureFlagOverride[]>([]);
  const [featureFlagAuditLog, setFeatureFlagAuditLog] = useState<FeatureFlagAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [flagExpiryDrafts, setFlagExpiryDrafts] = useState<Record<number, string>>({});
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newFlagName, setNewFlagName] = useState("");
  const [newFlagDescription, setNewFlagDescription] = useState("");
  const [newFlagDefaultEnabled, setNewFlagDefaultEnabled] = useState(false);

  const { confirm, ConfirmDialog } = useConfirm();

  const loadAll = async () => {
    try {
      const [schoolsRes, flagsRes, auditLogRes] = await Promise.all([
        api.get("/system-admin/schools"),
        api.get("/system-admin/feature-flags"),
        api.get("/system-admin/feature-flags/audit-log")
      ]);
      setSchools(schoolsRes.data || []);
      setFeatureFlags(flagsRes.data?.flags || []);
      setFeatureFlagOverrides(flagsRes.data?.overrides || []);
      setFeatureFlagAuditLog(auditLogRes.data || []);
      setError(null);
    } catch (err) {
      console.error("Failed to load feature flags", err);
      setError(getErrorMessage(err, "Failed to load feature toggles."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const createFeatureFlag = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/system-admin/feature-flags", {
        feature_key: newFlagKey,
        name: newFlagName,
        description: newFlagDescription,
        default_enabled: newFlagDefaultEnabled
      });

      setNewFlagKey("");
      setNewFlagName("");
      setNewFlagDescription("");
      setNewFlagDefaultEnabled(false);
      await loadAll();
      setSuccess("Feature created successfully.");
    } catch (err) {
      console.error("Create feature flag error:", err);
      setError(getErrorMessage(err, "Failed to create feature"));
    }
  };

  const setSchoolFeature = async (flagId: number, schoolId: number, enabled: boolean) => {
    try {
      await api.put(`/system-admin/feature-flags/${flagId}/schools/${schoolId}`, { enabled });
      await loadAll();
      setSuccess("School feature access updated.");
    } catch (err) {
      console.error("Set school feature error:", err);
      setError(getErrorMessage(err, "Failed to update school feature access"));
    }
  };

  const resetSchoolFeature = async (flagId: number, schoolId: number) => {
    try {
      await api.delete(`/system-admin/feature-flags/${flagId}/schools/${schoolId}`);
      await loadAll();
      setSuccess("School reverted to the feature's default.");
    } catch (err) {
      console.error("Reset school feature error:", err);
      setError(getErrorMessage(err, "Failed to reset school feature access"));
    }
  };

  const saveFeatureFlagExpiry = async (flag: FeatureFlag) => {
    const expiresAt = flagExpiryDrafts[flag.id] ?? toDatetimeLocal(flag.expires_at);

    try {
      await api.put(`/system-admin/feature-flags/${flag.id}`, {
        name: flag.name,
        description: flag.description,
        default_enabled: !!flag.default_enabled,
        expires_at: expiresAt || null
      });

      await loadAll();
      setSuccess("Expiry date saved.");
    } catch (err) {
      console.error("Save feature flag expiry error:", err);
      setError(getErrorMessage(err, "Failed to save expiry date"));
    }
  };

  const deleteFeatureFlag = async (flag: FeatureFlag) => {
    if (!(await confirm(`Delete the "${flag.name}" feature toggle?`))) return;

    try {
      await api.delete(`/system-admin/feature-flags/${flag.id}`);
      await loadAll();
      setSuccess("Feature deleted successfully.");
    } catch (err) {
      console.error("Delete feature flag error:", err);
      setError(getErrorMessage(err, "Failed to delete feature"));
    }
  };

  if (loading) return <p style={styles.text}>Loading feature toggles…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {ConfirmDialog}
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
        <h3 style={{ marginBottom: 12 }}>Create Feature Toggle</h3>

        <p style={{ marginBottom: 16, color: "#475569" }}>
          Add a new feature switch. Set an expiry date to automatically revert
          it back to its default state once that date passes.
        </p>

        <form
          onSubmit={createFeatureFlag}
          style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>Feature Key</label>
            <input
              placeholder="e.g. new_attendance_ui"
              value={newFlagKey}
              onChange={e => setNewFlagKey(e.target.value)}
              required
              style={styles.input}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>Display Name</label>
            <input
              placeholder="e.g. New Attendance UI"
              value={newFlagName}
              onChange={e => setNewFlagName(e.target.value)}
              required
              style={styles.input}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>Description</label>
            <textarea
              placeholder="What does this feature control?"
              value={newFlagDescription}
              onChange={e => setNewFlagDescription(e.target.value)}
              rows={3}
              style={{ ...styles.input, resize: "vertical", paddingTop: 10 }}
            />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "#334155" }}>
            <input
              type="checkbox"
              checked={newFlagDefaultEnabled}
              onChange={e => setNewFlagDefaultEnabled(e.target.checked)}
            />
            Enabled by default
          </label>

          <button style={{ ...styles.actionBtn, marginTop: 8 }}>
            Create Feature
          </button>
        </form>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Features</h3>

        {featureFlags.length === 0 ? (
          <p style={styles.text}>No feature toggles have been created yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Feature</th>
                  <th style={{ textAlign: "left" }}>Per-School Access</th>
                  <th style={{ textAlign: "left" }}>Expires</th>
                  <th style={{ textAlign: "center", width: 120 }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {featureFlags.map(flag => {
                  const expiryDraft =
                    flagExpiryDrafts[flag.id] ?? toDatetimeLocal(flag.expires_at);

                  return (
                    <tr key={flag.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{flag.name}</div>
                        <div style={{ fontSize: 13, color: "#64748b" }}>{flag.feature_key}</div>
                        {flag.description && (
                          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                            {flag.description}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                          Default for schools with no override: {flag.default_enabled ? "On" : "Off"}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260 }}>
                          {schools.map(s => {
                            const override = featureFlagOverrides.find(
                              o => o.feature_flag_id === flag.id && o.school_id === s.id
                            );
                            const effectiveEnabled = override
                              ? !!override.enabled
                              : !!flag.default_enabled;

                            return (
                              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 13, minWidth: 120 }}>{s.name}</span>
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 8,
                                    fontWeight: 600,
                                    fontSize: 12,
                                    background: effectiveEnabled ? "#dcfce7" : "#fee2e2",
                                    color: effectiveEnabled ? "#166534" : "#991b1b"
                                  }}
                                >
                                  {effectiveEnabled ? "On" : "Off"}
                                </span>
                                <button
                                  onClick={() => setSchoolFeature(flag.id, s.id, !effectiveEnabled)}
                                  style={{
                                    background: effectiveEnabled ? "#dc2626" : "#16a34a",
                                    color: "white",
                                    border: "none",
                                    padding: "3px 10px",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    fontSize: 12
                                  }}
                                >
                                  {effectiveEnabled ? "Disable" : "Enable"}
                                </button>
                                {override && (
                                  <button
                                    onClick={() => resetSchoolFeature(flag.id, s.id)}
                                    style={{
                                      background: "transparent",
                                      color: "#64748b",
                                      border: "1px solid #cbd5e1",
                                      padding: "3px 10px",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      fontSize: 12
                                    }}
                                  >
                                    Reset
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <input
                            type="datetime-local"
                            value={expiryDraft}
                            onChange={e =>
                              setFlagExpiryDrafts(prev => ({
                                ...prev,
                                [flag.id]: e.target.value
                              }))
                            }
                            style={{ ...styles.input, minWidth: 200 }}
                          />
                          <button
                            onClick={() => saveFeatureFlagExpiry(flag)}
                            style={{ ...styles.secondaryBtn, alignSelf: "flex-start" }}
                          >
                            Save Expiry
                          </button>
                        </div>
                      </td>

                      <td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => deleteFeatureFlag(flag)}
                          style={{
                            background: "#64748b",
                            color: "white",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 14,
                            width: "100%"
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Audit Log</h3>

        {featureFlagAuditLog.length === 0 ? (
          <p style={styles.text}>No feature toggle changes yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>When</th>
                  <th style={{ textAlign: "left" }}>Who</th>
                  <th style={{ textAlign: "left" }}>What</th>
                </tr>
              </thead>
              <tbody>
                {featureFlagAuditLog.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: 13, color: "#64748b" }}>
                      {new Date(entry.created_at.replace(" ", "T")).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>{entry.actor_username}</td>
                    <td>{describeAuditEntry(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeatureFlagsSection;
