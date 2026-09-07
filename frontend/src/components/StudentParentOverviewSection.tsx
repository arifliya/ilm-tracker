import React, { useContext, useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDate } from "../utils/formatDate";
import SearchSort from "./SearchSort";
import Pagination from "./Pagination";
import { useConfirm } from "./ConfirmDialog";
import { AuthContext } from "../AuthContext";

const PAGE_SIZE = 5;

interface GuardianItem {
  parent_id: number;
  user_id: number | null;
  first_name: string | null;
  middle_name: string | null;
  surname: string | null;
  relationship_to_student: string | null;
  contact_number: string | null;
  email: string | null;
  medical_condition: string | null;
  address1: string | null;
  address2: string | null;
  address3: string | null;
  city: string | null;
  postcode: string | null;
}

interface StudentParentRow {
  student_id: number;
  student_school_id: number;
  student_user_id: number | null;
  student_first_name: string | null;
  student_middle_name: string | null;
  student_last_name: string | null;
  student_gender: string | null;
  student_date_of_birth: string | null;
  student_address1: string | null;
  student_address2: string | null;
  student_address3: string | null;
  student_city: string | null;
  student_postcode: string | null;
  student_medical_condition: string | null;
  student_guardian_code: string;
  class_id: number | null;
  class_name: string | null;
  guardians: GuardianItem[];
}

// Postgres returns COUNT(*) as a string in the driver's default row mode,
// but this codebase's frontend interfaces already normalize aggregate
// counts to `number` for display/comparison simplicity — matched here
// rather than mixed conventions within the same dashboard.
interface ParentItem {
  parent_id: number;
  parent_user_id: number;
  parent_school_id: number;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_contact_number: string | null;
  parent_email: string | null;
  student_count: number;
}

// Shared across Admin/Owner/SystemAdmin dashboards — identical table,
// guardian details, and assign/remove-guardian actions for all three
// roles. The one real difference (system_admin never gets the per-student
// "Login" reset/generate controls, since password_management is a
// per-school flag and system_admin has no single school) is handled here
// by reading the caller's own role rather than needing a prop.
const StudentParentOverviewSection: React.FC = () => {
  const { user } = useContext(AuthContext);
  const { confirm, ConfirmDialog } = useConfirm();

  const [studentsParents, setStudentsParents] = useState<StudentParentRow[]>([]);
  const [total, setTotal] = useState(0);
  // Full, unpaginated list — feeds the "Assign Another Guardian" dropdown
  // below, which needs every parent in scope to filter/search against,
  // not one page of them. Fetched with no page/pageSize, same as every
  // other dropdown consumer of this endpoint (ClassManagementSection,
  // TimetableSection) — see /admin/parents's own comment.
  const [parents, setParents] = useState<ParentItem[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("az");
  const [page, setPage] = useState(0);
  const [expandedStudents, setExpandedStudents] = useState<Record<number, boolean>>({});
  const [assignGuardianParentId, setAssignGuardianParentId] = useState<Record<number, string>>({});

  // Server-side paginated/searched/sorted — see AllUsersSection's own
  // comment, same reasoning applies to a school's student count.
  const loadStudentsParents = async () => {
    try {
      const res = await api.get("/admin/students-parents", { params: { page, pageSize: PAGE_SIZE, search, sort } });
      setStudentsParents(res.data.studentsParents || []);
      setTotal(res.data.total || 0);
      setError(null);
    } catch (err) {
      console.error("Failed to load students & parents", err);
      setError(getErrorMessage(err, "Failed to load students & parents."));
    } finally {
      setLoading(false);
    }
  };

  const loadParents = async () => {
    try {
      const res = await api.get("/admin/parents");
      setParents(res.data || []);
    } catch (err) {
      console.error("Failed to load parents", err);
      setError(getErrorMessage(err, "Failed to load parents."));
    }
  };

  const loadFeatures = async () => {
    try {
      const res = await api.get("/features");
      setFeatures(res.data?.flags || {});
    } catch (err) {
      console.error("Failed to load features", err);
    }
  };

  useEffect(() => {
    loadStudentsParents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, sort]);

  useEffect(() => {
    loadParents();
    loadFeatures();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleResetPassword = async (userId: number, label: string) => {
    if (!(await confirm(`Reset ${label}'s password? A new one-time password will be generated.`))) return;

    try {
      const res = await api.post(`/admin/users/${userId}/reset-password`);
      setSuccess(
        `Password reset for ${label}. One-time password: ${res.data.temporaryPassword} — share this with them directly, it won't be shown again.`
      );
    } catch (err) {
      console.error("Reset password error:", err);
      setError(getErrorMessage(err, "Failed to reset password"));
    }
  };

  const handleGenerateStudentLogin = async (studentId: number, label: string) => {
    if (!(await confirm(`Generate a login for ${label}? A one-time password will be created.`))) return;

    try {
      const res = await api.post(`/admin/students/${studentId}/generate-login`);
      setSuccess(
        `Login created for ${label}. Username: ${res.data.username}. One-time password: ${res.data.temporaryPassword} — share this with them directly, it won't be shown again.`
      );
      await loadStudentsParents();
    } catch (err) {
      console.error("Generate student login error:", err);
      setError(getErrorMessage(err, "Failed to generate login"));
    }
  };

  const assignGuardian = async (studentId: number) => {
    const parentId = assignGuardianParentId[studentId];
    if (!parentId) return;

    try {
      await api.post(`/admin/students/${studentId}/assign-guardian`, { parent_id: Number(parentId) });
      setAssignGuardianParentId(prev => ({ ...prev, [studentId]: "" }));
      await loadStudentsParents();
      setSuccess("Guardian assigned.");
    } catch (err) {
      console.error("Assign guardian error:", err);
      setError(getErrorMessage(err, "Failed to assign guardian"));
    }
  };

  const removeGuardian = async (studentId: number, parentId: number) => {
    if (!(await confirm("Remove this guardian from the student?"))) return;

    try {
      await api.post(`/admin/students/${studentId}/remove-guardian`, { parent_id: parentId });
      await loadStudentsParents();
      setSuccess("Guardian removed.");
    } catch (err) {
      console.error("Remove guardian error:", err);
      setError(getErrorMessage(err, "Failed to remove guardian"));
    }
  };

  // system_admin always sees these controls, unconditionally (no per-school
  // password_management flag applies to it, since it has no single school) —
  // everyone else needs that school's flag on. Originally: !system_admin &&
  // flag, which backwards-hid the block for system_admin entirely; fixed to
  // match the pre-split behavior (system_admin's copy had no gate at all).
  const showLoginControls = user?.role === "system_admin" || features.password_management;

  if (loading) return <p style={styles.text}>Loading students & parents…</p>;

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
        <h3 style={{ marginBottom: 16 }}>Student & Parent Overview</h3>

        <SearchSort search={search} onSearch={setSearch} sort={sort} onSort={setSort} />

        <div style={{ overflowX: "auto" }}>
          <table style={{ ...styles.table, width: "100%", maxWidth: "900px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Student Name</th>
                <th style={{ textAlign: "left" }}>Date of Birth</th>
                <th style={{ textAlign: "left" }}>Class</th>
                <th style={{ textAlign: "center", width: 120 }}>View Details</th>
              </tr>
            </thead>

            <tbody>
              {studentsParents.map(row => {
                const studentId = row.student_id;
                const isExpanded = !!expandedStudents[studentId];
                const studentUserId = row.student_user_id;

                const studentAddress = [row.student_address1, row.student_address2, row.student_address3]
                  .filter(Boolean)
                  .join(", ");

                return (
                  <React.Fragment key={studentId}>
                    <tr>
                      <td>
                        <strong>
                          {row.student_first_name} {row.student_last_name}
                        </strong>
                      </td>

                      <td>{formatDate(row.student_date_of_birth || "")}</td>

                      <td>{row.class_name || "—"}</td>

                      <td style={{ textAlign: "center" }}>
                        <button
                          style={styles.secondaryBtn}
                          onClick={() =>
                            setExpandedStudents(prev => ({
                              ...prev,
                              [studentId]: !prev[studentId]
                            }))
                          }
                        >
                          {isExpanded ? "▼ Hide" : "▶ View"}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={3}>
                          <div
                            style={{
                              width: "100%",
                              maxWidth: "900px",
                              margin: "0 auto",
                              padding: 24,
                              background: "#f8f7ff",
                              borderRadius: 14,
                              marginTop: 10,
                              border: "2px solid #e2d9ff",
                              fontSize: 15,
                              lineHeight: "1.7"
                            }}
                          >
                            <div style={{ marginBottom: 20 }}>
                              <h4 style={{ fontSize: 18, marginBottom: 10, color: "#4c1d95" }}>Student Details</h4>

                              <div>
                                <strong>Gender:</strong> {row.student_gender || "—"}
                              </div>
                              <div>
                                <strong>Address:</strong> {studentAddress || "—"}
                              </div>
                              <div>
                                <strong>City:</strong> {row.student_city || "—"}
                              </div>
                              <div>
                                <strong>Postcode:</strong> {row.student_postcode || "—"}
                              </div>
                              <div>
                                <strong>Medical Condition:</strong> {row.student_medical_condition || "—"}
                              </div>
                            </div>

                            <hr style={{ margin: "20px 0" }} />

                            <div>
                              <h4 style={{ fontSize: 18, marginBottom: 10, color: "#4c1d95" }}>Guardian Code</h4>
                              <div>{row.student_guardian_code || "—"}</div>
                            </div>

                            {showLoginControls && (
                              <>
                                <hr style={{ margin: "20px 0" }} />
                                <div>
                                  <h4 style={{ fontSize: 18, marginBottom: 10, color: "#4c1d95" }}>Login</h4>
                                  {studentUserId ? (
                                    <button
                                      style={styles.secondaryBtn}
                                      onClick={() =>
                                        handleResetPassword(studentUserId, `${row.student_first_name} ${row.student_last_name}`)
                                      }
                                    >
                                      Reset Password
                                    </button>
                                  ) : (
                                    <button
                                      style={styles.secondaryBtn}
                                      onClick={() =>
                                        handleGenerateStudentLogin(studentId, `${row.student_first_name} ${row.student_last_name}`)
                                      }
                                    >
                                      Generate Login
                                    </button>
                                  )}
                                </div>
                              </>
                            )}

                            <hr style={{ margin: "20px 0" }} />

                            {(row.guardians || []).map((g, gIdx) => (
                              <div key={g.parent_id} style={{ marginBottom: 16 }}>
                                <h4
                                  style={{
                                    fontSize: 18,
                                    marginBottom: 10,
                                    color: "#4c1d95",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center"
                                  }}
                                >
                                  Guardian {gIdx + 1}
                                  {(row.guardians || []).length > 1 && (
                                    <button
                                      style={{ ...styles.secondaryBtn, background: "#dc2626", color: "#fff" }}
                                      onClick={() => removeGuardian(studentId, g.parent_id)}
                                    >
                                      Remove
                                    </button>
                                  )}
                                </h4>

                                <div>
                                  <strong>Name:</strong> {g.first_name} {g.surname}
                                </div>
                                <div>
                                  <strong>Email:</strong> {g.email}
                                </div>
                                <div>
                                  <strong>Relationship:</strong> {g.relationship_to_student || "—"}
                                </div>
                                <div>
                                  <strong>Phone Number:</strong> {g.contact_number || "—"}
                                </div>
                                <div>
                                  <strong>Medical Notes:</strong> {g.medical_condition || "—"}
                                </div>
                              </div>
                            ))}

                            <hr style={{ margin: "20px 0" }} />

                            <div>
                              <h4 style={{ fontSize: 16, marginBottom: 8, color: "#4c1d95" }}>Assign Another Guardian</h4>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <select
                                  style={styles.input}
                                  value={assignGuardianParentId[studentId] || ""}
                                  onChange={e =>
                                    setAssignGuardianParentId(prev => ({ ...prev, [studentId]: e.target.value }))
                                  }
                                >
                                  <option value="">Select an existing parent...</option>
                                  {parents
                                    .filter(p => p.parent_school_id === row.student_school_id)
                                    .filter(p => !(row.guardians || []).some(g => g.parent_id === p.parent_id))
                                    .map(p => (
                                      <option key={p.parent_id} value={p.parent_id}>
                                        {p.parent_first_name} {p.parent_last_name}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  style={styles.actionBtn}
                                  disabled={!assignGuardianParentId[studentId]}
                                  onClick={() => assignGuardian(studentId)}
                                >
                                  Assign
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination page={page} setPage={setPage} pageSize={PAGE_SIZE} total={total} />
      </div>
    </div>
  );
};

export default StudentParentOverviewSection;
