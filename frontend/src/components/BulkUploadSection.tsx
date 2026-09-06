import React, { useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";
import { parseCsv } from "../utils/parseCsv";

interface BulkUploadRowResult {
  row: number;
  status: "created" | "error";
  message?: string;
  studentId?: number;
  parentCreated?: boolean;
  temporaryPassword?: string;
  studentUsername?: string;
  studentTemporaryPassword?: string;
}

const BULK_UPLOAD_COLUMNS = [
  "student_first_name",
  "student_middle_name",
  "student_surname",
  "student_gender",
  "student_date_of_birth",
  "student_address1",
  "student_address2",
  "student_address3",
  "student_city",
  "student_postcode",
  "student_medical_condition",
  "class_code",
  "parent_first_name",
  "parent_middle_name",
  "parent_surname",
  "parent_relationship_to_student",
  "parent_date_of_birth",
  "parent_address1",
  "parent_address2",
  "parent_address3",
  "parent_city",
  "parent_postcode",
  "parent_medical_condition",
  "parent_contact_number",
  "parent_email"
];

// Admin-only — the CSV student-import flow. Self-contained: owns its own
// state, no shared parent dashboard state.
const BulkUploadSection: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  const [bulkUploadFileName, setBulkUploadFileName] = useState("");
  const [bulkUploadRows, setBulkUploadRows] = useState<Record<string, string>[]>([]);
  const [bulkUploadParseError, setBulkUploadParseError] = useState("");
  const [bulkUploadSubmitting, setBulkUploadSubmitting] = useState(false);
  const [bulkUploadResults, setBulkUploadResults] = useState<BulkUploadRowResult[] | null>(null);
  const [bulkUploadSummary, setBulkUploadSummary] = useState<{ total: number; succeeded: number; failed: number } | null>(
    null
  );

  const downloadBulkUploadTemplate = () => {
    const csv = BULK_UPLOAD_COLUMNS.join(",") + "\r\n";
    const blobUrl = window.URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = "student_import_template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const handleBulkUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setBulkUploadResults(null);
    setBulkUploadSummary(null);
    setBulkUploadParseError("");
    if (!file) {
      setBulkUploadFileName("");
      setBulkUploadRows([]);
      return;
    }

    setBulkUploadFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCsv(String(reader.result || ""));
        if (parsed.length === 0) {
          setBulkUploadParseError("No data rows found in this file.");
          setBulkUploadRows([]);
          return;
        }
        setBulkUploadRows(parsed);
      } catch (err) {
        console.error("Parse CSV error:", err);
        setBulkUploadParseError("Failed to parse this file as CSV.");
        setBulkUploadRows([]);
      }
    };
    reader.onerror = () => setBulkUploadParseError("Failed to read this file.");
    reader.readAsText(file);
  };

  const submitBulkUpload = async () => {
    if (bulkUploadRows.length === 0) return;

    setBulkUploadSubmitting(true);
    setBulkUploadResults(null);
    setBulkUploadSummary(null);
    try {
      const res = await api.post("/admin/students/bulk-upload", { rows: bulkUploadRows });
      setBulkUploadSummary(res.data.summary);
      setBulkUploadResults(res.data.results);
    } catch (err) {
      console.error("Bulk upload error:", err);
      setError(getErrorMessage(err, "Failed to upload students"));
    } finally {
      setBulkUploadSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: "12px 16px",
            fontSize: 14
          }}
        >
          {error}
        </div>
      )}

      <div style={styles.card}>
        <h3 style={{ marginBottom: 8 }}>Import Students from CSV</h3>
        <p style={{ ...styles.text, fontSize: 13, color: "#64748b" }}>
          Each row creates a student and either links them to an existing parent (matched by
          email) as an additional guardian, or creates a new parent account. New parent accounts
          get a one-time password shown below the upload — this app has no email delivery, so
          you'll need to share it with the parent directly.
        </p>

        <button style={{ ...styles.secondaryBtn, marginBottom: 16 }} onClick={downloadBulkUploadTemplate}>
          Download CSV template
        </button>

        <div style={{ marginBottom: 16 }}>
          <input type="file" accept=".csv,text/csv" onChange={handleBulkUploadFile} data-testid="bulk-upload-file-input" />
        </div>

        {bulkUploadParseError && <p style={{ ...styles.text, color: "#dc2626" }}>{bulkUploadParseError}</p>}

        {bulkUploadRows.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={styles.text}>
              <strong>{bulkUploadFileName}</strong> — {bulkUploadRows.length} row
              {bulkUploadRows.length === 1 ? "" : "s"} ready to upload.
            </p>
            <button style={styles.actionBtn} onClick={submitBulkUpload} disabled={bulkUploadSubmitting}>
              {bulkUploadSubmitting ? "Uploading..." : "Upload"}
            </button>
          </div>
        )}

        {bulkUploadSummary && (
          <p style={styles.text}>
            <strong>{bulkUploadSummary.succeeded}</strong> of <strong>{bulkUploadSummary.total}</strong> rows created
            successfully
            {bulkUploadSummary.failed > 0 ? `, ${bulkUploadSummary.failed} failed.` : "."}
          </p>
        )}

        {bulkUploadResults && bulkUploadResults.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Row</th>
                  <th style={{ textAlign: "left" }}>Status</th>
                  <th style={{ textAlign: "left" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {bulkUploadResults.map(r => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td style={{ color: r.status === "created" ? "#16a34a" : "#dc2626" }}>
                      {r.status === "created" ? "Created" : "Error"}
                    </td>
                    <td>
                      {r.status === "error" ? (
                        r.message
                      ) : (
                        <>
                          {r.parentCreated ? (
                            <div>
                              New parent account created. One-time password: <strong>{r.temporaryPassword}</strong> —
                              share this with the parent directly, it won't be shown again.
                            </div>
                          ) : (
                            <div>Linked to existing parent.</div>
                          )}
                          {r.studentUsername && (
                            <div>
                              Student login created. Username: <strong>{r.studentUsername}</strong>, one-time password:{" "}
                              <strong>{r.studentTemporaryPassword}</strong> — share this with the family directly, it
                              won't be shown again.
                            </div>
                          )}
                        </>
                      )}
                    </td>
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

export default BulkUploadSection;
