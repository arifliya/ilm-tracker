import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";
import SearchSort from "./SearchSort";
import Pagination from "./Pagination";
import { useConfirm } from "./ConfirmDialog";

const PAGE_SIZE = 5;

interface GuardianItem {
  parent_id: number;
  first_name: string | null;
  surname: string | null;
  contact_number: string | null;
}

interface StudentParentRow {
  student_id: number;
  student_first_name: string | null;
  student_last_name: string | null;
  guardians: GuardianItem[];
}

interface ParentItem {
  parent_id: number;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_contact_number: string | null;
  parent_email: string | null;
  student_count: number;
}

// Shared between AdminDashboard and OwnerDashboard — identical for both
// roles. NOT used by SystemAdminDashboard: system_admin's remove-parent
// flow is genuinely different (inline per-guardian actions with a
// password-reset button, no "must have zero students first" gate), so it
// stays as its own implementation there rather than being forced into
// this shape.
const RemoveUsersSection: React.FC = () => {
  const { confirm, ConfirmDialog } = useConfirm();

  const [studentsParents, setStudentsParents] = useState<StudentParentRow[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [parents, setParents] = useState<ParentItem[]>([]);
  const [totalParents, setTotalParents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchRemove, setSearchRemove] = useState("");
  const [sortRemove, setSortRemove] = useState("az");
  const [pageRemove, setPageRemove] = useState(0);
  const [searchRemoveParents, setSearchRemoveParents] = useState("");
  const [sortRemoveParents, setSortRemoveParents] = useState("az");
  const [pageRemoveParents, setPageRemoveParents] = useState(0);

  // Server-side paginated/searched/sorted — these tables have no per-row
  // cap otherwise, and a real school's student/parent count won't stay at
  // seed-data scale forever (same reasoning as AllUsersSection).
  const loadStudentsParents = async () => {
    try {
      const res = await api.get("/admin/students-parents", {
        params: { page: pageRemove, pageSize: PAGE_SIZE, search: searchRemove, sort: sortRemove }
      });
      setStudentsParents(res.data.studentsParents || []);
      setTotalStudents(res.data.total || 0);
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
      const res = await api.get("/admin/parents", {
        params: { page: pageRemoveParents, pageSize: PAGE_SIZE, search: searchRemoveParents, sort: sortRemoveParents }
      });
      setParents(res.data.parents || []);
      setTotalParents(res.data.total || 0);
    } catch (err) {
      console.error("Failed to load parents", err);
      setError(getErrorMessage(err, "Failed to load parents."));
    }
  };

  useEffect(() => {
    loadStudentsParents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRemove, searchRemove, sortRemove]);

  useEffect(() => {
    loadParents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRemoveParents, searchRemoveParents, sortRemoveParents]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleRemoveStudent = async (studentId: number) => {
    if (!(await confirm("Remove this student permanently?"))) return;

    try {
      await api.delete(`/admin/remove-student/${studentId}`);
      await loadStudentsParents();
      setSuccess("Student removed successfully.");
    } catch (err) {
      console.error("Remove student error:", err);
      setError(getErrorMessage(err, "Failed to remove student"));
    }
  };

  const handleRemoveParent = async (parentId: number) => {
    if (!(await confirm("Remove this parent permanently?"))) return;

    try {
      await api.delete(`/admin/remove-parent/${parentId}`);
      await loadParents();
      setSuccess("Parent removed successfully.");
    } catch (err) {
      console.error("Remove parent error:", err);
      setError(getErrorMessage(err, "Failed to remove parent"));
    }
  };

  if (loading) return <p style={styles.text}>Loading…</p>;

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
        <h3 style={{ marginBottom: 16 }}>Remove Students</h3>

        <SearchSort search={searchRemove} onSearch={setSearchRemove} sort={sortRemove} onSort={setSortRemove} />

        <div style={{ overflowX: "auto" }}>
          <table style={{ ...styles.table, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Student</th>
                <th style={{ textAlign: "left" }}>Parent</th>
                <th style={{ textAlign: "left" }}>Contact</th>
                <th style={{ textAlign: "center", width: 160 }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {studentsParents.map(row => (
                <tr key={row.student_id}>
                  <td>
                    <strong>
                      {row.student_first_name} {row.student_last_name}
                    </strong>
                  </td>

                  <td>{(row.guardians || []).map(g => `${g.first_name} ${g.surname}`).join(", ") || "—"}</td>

                  <td>{(row.guardians || []).map(g => g.contact_number).filter(Boolean).join(", ") || "—"}</td>

                  <td style={{ textAlign: "center" }}>
                    <button
                      onClick={() => handleRemoveStudent(row.student_id)}
                      style={{
                        background: "#26dc87",
                        color: "white",
                        border: "none",
                        padding: "6px 8px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 14
                      }}
                    >
                      Remove Student
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={pageRemove} setPage={setPageRemove} pageSize={PAGE_SIZE} total={totalStudents} />
      </div>

      {/* Own table so a parent stays reachable even after their last
          student has been removed — students-parents above is an inner
          join from students and drops childless parents entirely. */}
      <div style={styles.card}>
        <h3 style={{ marginBottom: 8 }}>Remove Parents</h3>
        <p style={{ marginBottom: 16, color: "#64748b", fontSize: 14 }}>
          A parent can only be removed once they have no students linked to their account.
        </p>

        <SearchSort
          search={searchRemoveParents}
          onSearch={setSearchRemoveParents}
          sort={sortRemoveParents}
          onSort={setSortRemoveParents}
        />

        <div style={{ overflowX: "auto" }}>
          <table style={{ ...styles.table, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Parent</th>
                <th style={{ textAlign: "left" }}>Contact</th>
                <th style={{ textAlign: "left" }}>Email</th>
                <th style={{ textAlign: "center" }}>Students</th>
                <th style={{ textAlign: "center", width: 160 }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {parents.map(p => {
                const hasStudents = Number(p.student_count) > 0;
                return (
                  <tr key={p.parent_id}>
                    <td>
                      <strong>
                        {p.parent_first_name} {p.parent_last_name}
                      </strong>
                    </td>

                    <td>{p.parent_contact_number || "—"}</td>
                    <td>{p.parent_email || "—"}</td>

                    <td style={{ textAlign: "center" }}>{p.student_count}</td>

                    <td style={{ textAlign: "center" }}>
                      <button
                        onClick={() => handleRemoveParent(p.parent_id)}
                        disabled={hasStudents}
                        title={hasStudents ? "Remove this parent's students first" : undefined}
                        style={{
                          background: hasStudents ? "#fca5a5" : "#b91c1c",
                          color: "white",
                          border: "none",
                          padding: "6px 8px",
                          borderRadius: 6,
                          cursor: hasStudents ? "not-allowed" : "pointer",
                          fontSize: 14
                        }}
                      >
                        Remove Parent
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination page={pageRemoveParents} setPage={setPageRemoveParents} pageSize={PAGE_SIZE} total={totalParents} />
      </div>
    </div>
  );
};

export default RemoveUsersSection;
