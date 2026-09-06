import React, { useContext, useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import SearchSort from "./SearchSort";
import Pagination from "./Pagination";
import { useConfirm } from "./ConfirmDialog";
import { sortData, paginate } from "../utils/tableHelpers";
import { getErrorMessage } from "../utils/getErrorMessage";
import { useClassManagement } from "../hooks/useClassManagement";
import { AuthContext } from "../AuthContext";

const PAGE_SIZE = 5;

interface ClassItem {
  id: number;
  school_id: number;
  school_name: string | null;
  school_code: string;
  class_name: string | null;
  class_code: string;
  year_group: string | null;
  description: string | null;
}

// Only used for the Create Class school picker, system_admin only —
// GET /system-admin/schools 403s for every other role, so it's only ever
// fetched when the logged-in role actually is system_admin.
interface SchoolOption {
  id: number;
  name: string;
}

// Only the fields this section's "Assign Student to Class" dropdown reads —
// GET /admin/students-parents returns much more (guardians, addresses,
// etc.), not needed here.
interface StudentOption {
  student_id: number;
  student_first_name: string | null;
  student_last_name: string | null;
}

// Shared between AdminDashboard, OwnerDashboard, and SystemAdminDashboard —
// identical functionality across all three, so it lives here rather than
// being duplicated in each dashboard file (same reasoning as
// FeeTrackingSection). Fully self-contained: owns its own data, its own
// error/success banners, and its own confirm dialog rather than reusing
// whichever one the parent dashboard happens to render.
const ClassManagementSection: React.FC = () => {
  const { user } = useContext(AuthContext);
  const isSystemAdmin = user?.role === "system_admin";

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("az");
  const [page, setPage] = useState(0);

  const { confirm, ConfirmDialog } = useConfirm();

  const loadClasses = async () => {
    try {
      const res = await api.get("/admin/classes");
      setClasses(res.data || []);
      setError(null);
    } catch (err) {
      console.error("Failed to load classes", err);
      setError(getErrorMessage(err, "Failed to load classes."));
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    try {
      const res = await api.get("/admin/students-parents");
      setStudents(res.data || []);
    } catch (err) {
      console.error("Failed to load students", err);
    }
  };

  const loadSchools = async () => {
    try {
      const res = await api.get("/system-admin/schools");
      setSchools(res.data || []);
    } catch (err) {
      console.error("Failed to load schools", err);
    }
  };

  useEffect(() => {
    loadClasses();
    loadStudents();
    if (isSystemAdmin) loadSchools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    newClassSchoolId,
    setNewClassSchoolId,
    newClassName,
    setNewClassName,
    newClassCode,
    setNewClassCode,
    newClassYearGroup,
    setNewClassYearGroup,
    newClassDescription,
    setNewClassDescription,
    editingClass,
    setEditingClass,
    assignStudentClassId,
    setAssignStudentClassId,
    assignStudentId,
    setAssignStudentId,
    createClass,
    saveClassChanges,
    assignStudentToClass,
    handleDeleteClass
  } = useClassManagement({ reload: loadClasses, setLoadError: setError, setSuccessMessage: setSuccess, confirm });

  if (loading) return <p style={styles.text}>Loading classes…</p>;

  const filteredClasses = classes.filter((c) =>
    (
      `${c?.class_name || ""} ${c?.year_group || ""} ${c?.class_code || ""}` +
      (isSystemAdmin ? ` ${c?.school_name || ""}` : "")
    )
      .toLowerCase()
      .includes(search.toLowerCase())
  );

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

      {/* CREATE CLASS */}
      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Create Class</h3>

        <form
          onSubmit={createClass}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 500
          }}
        >
          {isSystemAdmin && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontWeight: 600, color: "#334155" }}>School</label>
              <select
                value={newClassSchoolId}
                onChange={e => setNewClassSchoolId(e.target.value)}
                required
                style={styles.input}
              >
                <option value="">Choose a school</option>
                {schools.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>Class Name</label>
            <input
              placeholder="Enter class name"
              value={newClassName}
              onChange={e => setNewClassName(e.target.value)}
              required
              style={styles.input}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>Class Code</label>
            <input
              placeholder="e.g. 7A"
              value={newClassCode}
              onChange={e => setNewClassCode(e.target.value)}
              required
              style={styles.input}
            />
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {isSystemAdmin
                ? "The selected school's code is added automatically as a prefix (e.g. \"7A\" becomes \"SCHOOLCODE-7A\")."
                : "Your school code is added automatically as a prefix (e.g. \"7A\" becomes \"SCHOOLCODE-7A\")."}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>Year Group</label>
            <input
              placeholder="Enter year group"
              value={newClassYearGroup}
              onChange={e => setNewClassYearGroup(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>Description</label>
            <textarea
              placeholder="Enter class description"
              value={newClassDescription}
              onChange={e => setNewClassDescription(e.target.value)}
              rows={3}
              style={{
                ...styles.input,
                resize: "vertical",
                paddingTop: 10
              }}
            />
          </div>

          <button style={{ ...styles.actionBtn, marginTop: 8 }}>
            Create Class
          </button>
        </form>
      </div>

      {/* EXISTING CLASSES */}
      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Existing Classes</h3>

        <SearchSort search={search} onSearch={setSearch} sort={sort} onSort={setSort} />

        <div style={{ overflowX: "auto" }}>
        <table style={{ ...styles.table, width: "100%" }}>
          <thead>
            <tr>
              {isSystemAdmin && <th style={{ textAlign: "left" }}>School</th>}
              <th style={{ textAlign: "left" }}>Class Name</th>
              <th style={{ textAlign: "left" }}>Class Code</th>
              <th style={{ textAlign: "left" }}>Year Group</th>
              <th style={{ textAlign: "left" }}>Description</th>
              <th style={{ textAlign: "center", width: 120 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {paginate(sortData(filteredClasses, "class_name", sort), page, PAGE_SIZE).map((c) => (
              <tr key={c.id}>
                {isSystemAdmin && <td>{c.school_name || "—"}</td>}
                <td>{c.class_name}</td>
                <td>{c.class_code || "—"}</td>
                <td>{c.year_group || "—"}</td>
                <td>{c.description || "—"}</td>

                <td style={{ textAlign: "center" }}>
                  <button
                    onClick={() => handleDeleteClass(c.id)}
                    style={{
                      background: "#dc2626",
                      color: "white",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 14
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <Pagination page={page} setPage={setPage} pageSize={PAGE_SIZE} total={filteredClasses.length} />
      </div>

      {/* EDIT CLASS DETAILS */}
      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Edit Class Details</h3>

        <div style={{ overflowX: "auto" }}>
        <table style={{ ...styles.table, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Class Name</th>
              <th style={{ textAlign: "left" }}>Class Code</th>
              <th style={{ textAlign: "left" }}>Year Group</th>
              <th style={{ textAlign: "left" }}>Description</th>
              <th style={{ textAlign: "center", width: 120 }}>Edit</th>
            </tr>
          </thead>

          <tbody>
            {classes.map((c) => (
              <React.Fragment key={c.id}>
                <tr>
                  <td>{c.class_name}</td>
                  <td>{c.class_code || "—"}</td>
                  <td>{c.year_group || "—"}</td>
                  <td>{c.description || "—"}</td>

                  <td style={{ textAlign: "center" }}>
                    <button
                      onClick={() => {
                        const prefix = `${c.school_code}-`;
                        setEditingClass({
                          ...c,
                          class_name: c.class_name || "",
                          class_code: c.class_code?.startsWith(prefix)
                            ? c.class_code.slice(prefix.length)
                            : c.class_code
                        });
                      }}
                      style={{
                        background: "#3b82f6",
                        color: "white",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 14
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>

                {editingClass?.id === c.id && (
                  <tr>
                    <td colSpan={5}>
                      <div
                        style={{
                          marginTop: 16,
                          padding: 20,
                          background: "#f8fafc",
                          borderRadius: 10,
                          border: "1px solid #e2e8f0"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12
                          }}
                        >
                          <label style={{ fontWeight: 600 }}>Class Name</label>
                          <input
                            value={editingClass!.class_name}
                            onChange={e =>
                              setEditingClass({
                                ...editingClass!,
                                class_name: e.target.value
                              })
                            }
                            style={styles.input}
                          />

                          <label style={{ fontWeight: 600 }}>Class Code</label>
                          <input
                            value={editingClass!.class_code || ""}
                            onChange={e =>
                              setEditingClass({
                                ...editingClass!,
                                class_code: e.target.value
                              })
                            }
                            style={styles.input}
                          />
                          <span style={{ fontSize: 12, color: "#64748b", marginTop: -6 }}>
                            School code prefix is added automatically — enter only the part after it.
                          </span>

                          <label style={{ fontWeight: 600 }}>Year Group</label>
                          <input
                            value={editingClass!.year_group || ""}
                            onChange={e =>
                              setEditingClass({
                                ...editingClass!,
                                year_group: e.target.value
                              })
                            }
                            style={styles.input}
                          />

                          <label style={{ fontWeight: 600 }}>Description</label>
                          <textarea
                            value={editingClass!.description || ""}
                            onChange={e =>
                              setEditingClass({
                                ...editingClass!,
                                description: e.target.value
                              })
                            }
                            rows={3}
                            style={{ ...styles.input, resize: "vertical" }}
                          />

                          <div
                            style={{
                              display: "flex",
                              gap: 12,
                              marginTop: 10
                            }}
                          >
                            <button
                              onClick={saveClassChanges}
                              style={{
                                background: "#16a34a",
                                color: "white",
                                border: "none",
                                padding: "8px 16px",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontSize: 14
                              }}
                            >
                              Save Changes
                            </button>

                            <button
                              onClick={() => setEditingClass(null)}
                              style={{
                                background: "#64748b",
                                color: "white",
                                border: "none",
                                padding: "8px 16px",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontSize: 14
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* ASSIGN STUDENT TO CLASS */}
      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Assign Student to Class</h3>

        <form
          onSubmit={assignStudentToClass}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 500
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>
              Select Class
            </label>
            <select
              value={assignStudentClassId}
              onChange={e => setAssignStudentClassId(e.target.value)}
              style={styles.input}
            >
              <option value="">Choose a class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.class_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#334155" }}>
              Select Student
            </label>
            <select
              value={assignStudentId}
              onChange={e => setAssignStudentId(e.target.value)}
              style={styles.input}
            >
              <option value="">Choose a student</option>
              {students.map((s) => (
                <option key={s.student_id} value={s.student_id}>
                  {s.student_first_name} {s.student_last_name}
                </option>
              ))}
            </select>
          </div>

          <button style={{ ...styles.actionBtn, marginTop: 8 }}>
            Assign Student
          </button>
        </form>
      </div>
    </div>
  );
};

export default ClassManagementSection;
