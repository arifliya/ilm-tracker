import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import SearchSort from "./SearchSort";
import Pagination from "./Pagination";
import { useConfirm } from "./ConfirmDialog";
import { formatDate } from "../utils/formatDate";
import { getErrorMessage } from "../utils/getErrorMessage";

const PAGE_SIZE = 5;

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface StudentRow {
  student_id: number;
  student_first_name: string | null;
  student_last_name: string | null;
  class_name: string | null;
}

interface ReportCardSubject {
  id: number;
  subject_name: string;
  grade: string;
  comment: string | null;
}

interface ReportCard {
  id: number;
  term_id: number;
  term_name: string;
  subjects: ReportCardSubject[];
}

type SubjectFormRow = { subject_name: string; grade: string; comment: string };
const emptySubjectRow = (): SubjectFormRow => ({ subject_name: "", grade: "", comment: "" });

// Admin-only — report card terms + per-student report cards. Self-contained:
// owns its own state, no shared parent dashboard state. The modal (opened
// via "Report Card" on a student row) uses position: fixed rather than a
// portal, so it renders correctly regardless of where its JSX lives —
// nesting it inside this component's own output (rather than needing it to
// live at the dashboard's top level) is fine.
const ReportCardsSection: React.FC = () => {
  const { confirm, ConfirmDialog } = useConfirm();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [studentsParents, setStudentsParents] = useState<StudentRow[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [terms, setTerms] = useState<Term[]>([]);
  const [newTermName, setNewTermName] = useState("");
  const [newTermStart, setNewTermStart] = useState("");
  const [newTermEnd, setNewTermEnd] = useState("");

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("az");
  const [page, setPage] = useState(0);

  const [reportCardStudent, setReportCardStudent] = useState<StudentRow | null>(null);
  const [studentReportCards, setStudentReportCards] = useState<ReportCard[]>([]);
  const [reportCardsLoading, setReportCardsLoading] = useState(false);
  const [editingReportCardId, setEditingReportCardId] = useState<number | null>(null);
  const [reportCardTermId, setReportCardTermId] = useState("");
  const [reportCardSubjects, setReportCardSubjects] = useState<SubjectFormRow[]>([emptySubjectRow()]);

  // Server-side paginated/searched/sorted — see AllUsersSection's own
  // comment, same reasoning applies to a school's student count.
  const loadStudents = async () => {
    try {
      const res = await api.get("/admin/students-parents", { params: { page, pageSize: PAGE_SIZE, search, sort } });
      setStudentsParents(res.data.studentsParents || []);
      setTotalStudents(res.data.total || 0);
    } catch (err) {
      console.error("Failed to load students", err);
      setError(getErrorMessage(err, "Failed to load students."));
    }
  };

  const loadTerms = async () => {
    try {
      const res = await api.get("/report-cards/terms");
      setTerms(res.data.terms || []);
    } catch (err) {
      console.error("Failed to load terms", err);
      setError(getErrorMessage(err, "Failed to load terms."));
    }
  };

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, sort]);

  useEffect(() => {
    loadTerms();
  }, []);

  const createTerm = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/report-cards/terms", {
        name: newTermName,
        start_date: newTermStart,
        end_date: newTermEnd
      });

      setNewTermName("");
      setNewTermStart("");
      setNewTermEnd("");
      await loadTerms();
      setSuccess("Term created successfully.");
    } catch (err) {
      console.error("Create term error:", err);
      setError(getErrorMessage(err, "Failed to create term"));
    }
  };

  const resetReportCardForm = () => {
    setEditingReportCardId(null);
    setReportCardTermId("");
    setReportCardSubjects([emptySubjectRow()]);
  };

  const openReportCardModal = async (student: StudentRow) => {
    setReportCardStudent(student);
    setStudentReportCards([]);
    resetReportCardForm();
    setReportCardsLoading(true);

    try {
      const res = await api.get(`/report-cards/students/${student.student_id}`);
      setStudentReportCards(res.data.reportCards || []);
    } catch (err) {
      console.error("Load report cards error:", err);
      setError(getErrorMessage(err, "Failed to load report cards"));
    } finally {
      setReportCardsLoading(false);
    }
  };

  const closeReportCardModal = () => {
    setReportCardStudent(null);
    setStudentReportCards([]);
    resetReportCardForm();
  };

  const startEditReportCard = (card: ReportCard) => {
    setEditingReportCardId(card.id);
    setReportCardTermId(String(card.term_id));
    setReportCardSubjects(
      card.subjects.length > 0
        ? card.subjects.map(s => ({ subject_name: s.subject_name, grade: s.grade, comment: s.comment || "" }))
        : [emptySubjectRow()]
    );
  };

  const updateSubjectRow = (index: number, field: keyof SubjectFormRow, value: string) => {
    setReportCardSubjects(prev => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addSubjectRow = () => setReportCardSubjects(prev => [...prev, emptySubjectRow()]);

  const removeSubjectRow = (index: number) =>
    setReportCardSubjects(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const reloadReportCards = async () => {
    if (!reportCardStudent) return;
    const res = await api.get(`/report-cards/students/${reportCardStudent.student_id}`);
    setStudentReportCards(res.data.reportCards || []);
  };

  const submitReportCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportCardStudent) return;

    const subjects = reportCardSubjects
      .filter(s => s.subject_name.trim() && s.grade.trim())
      .map(s => ({ subject_name: s.subject_name.trim(), grade: s.grade.trim(), comment: s.comment.trim() || undefined }));

    if (subjects.length === 0) {
      setError("At least one subject with a name and grade is required.");
      return;
    }

    try {
      if (editingReportCardId) {
        await api.put(`/report-cards/${editingReportCardId}`, { subjects });
        setSuccess("Report card updated.");
      } else {
        if (!reportCardTermId) {
          setError("Please select a term.");
          return;
        }
        await api.post(`/report-cards/students/${reportCardStudent.student_id}`, {
          term_id: Number(reportCardTermId),
          subjects
        });
        setSuccess("Report card created.");
      }
      await reloadReportCards();
      resetReportCardForm();
    } catch (err) {
      console.error("Save report card error:", err);
      setError(getErrorMessage(err, "Failed to save report card"));
    }
  };

  const deleteReportCard = async (id: number) => {
    if (!(await confirm("Are you sure you want to delete this report card?"))) return;

    try {
      await api.delete(`/report-cards/${id}`);
      setSuccess("Report card deleted.");
      await reloadReportCards();
      if (editingReportCardId === id) resetReportCardForm();
    } catch (err) {
      console.error("Delete report card error:", err);
      setError(getErrorMessage(err, "Failed to delete report card"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {ConfirmDialog}

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
      {success && (
        <div
          style={{
            background: "#dcfce7",
            color: "#166534",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            padding: "12px 16px",
            fontSize: 14
          }}
        >
          {success}
        </div>
      )}

      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Report Card Terms</h3>
        <p style={{ ...styles.text, fontSize: 13, color: "#64748b" }}>
          Create the terms teachers pick from when writing a student's report card, then use "Report Card" below to
          manage one for a specific student.
        </p>

        {terms.length > 0 && (
          <ul style={{ ...styles.list, marginBottom: 16 }}>
            {terms.map(t => (
              <li key={t.id} style={styles.listItem}>
                <strong>{t.name}</strong> — {formatDate(t.start_date)} to {formatDate(t.end_date)}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={createTerm} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Name</label>
            <input
              value={newTermName}
              onChange={e => setNewTermName(e.target.value)}
              style={styles.input}
              placeholder="e.g. Term 1 2025-26"
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Start Date</label>
            <input
              type="date"
              value={newTermStart}
              onChange={e => setNewTermStart(e.target.value)}
              style={styles.input}
              required
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontWeight: 600 }}>End Date</label>
            <input
              type="date"
              value={newTermEnd}
              onChange={e => setNewTermEnd(e.target.value)}
              style={styles.input}
              required
            />
          </div>
          <button style={{ ...styles.actionBtn, marginTop: 0 }}>Add Term</button>
        </form>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Students</h3>

        <SearchSort search={search} onSearch={setSearch} sort={sort} onSort={setSort} />

        <div style={{ overflowX: "auto" }}>
          <table style={{ ...styles.table, width: "100%", maxWidth: "700px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Student Name</th>
                <th style={{ textAlign: "left" }}>Class</th>
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
                  <td>{row.class_name || "—"}</td>
                  <td style={{ textAlign: "center" }}>
                    <button style={{ ...styles.actionBtn, marginTop: 0 }} onClick={() => openReportCardModal(row)}>
                      Report Card
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} setPage={setPage} pageSize={PAGE_SIZE} total={totalStudents} />
      </div>

      {reportCardStudent && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: 16
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 12,
              width: "100%",
              maxWidth: 560,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 16 }}>
              Report Cards — {reportCardStudent.student_first_name} {reportCardStudent.student_last_name}
            </h3>

            {reportCardsLoading ? (
              <p style={styles.text}>Loading report cards...</p>
            ) : studentReportCards.length === 0 ? (
              <p style={styles.text}>No report cards yet.</p>
            ) : (
              <ul style={{ ...styles.list, marginBottom: 16 }}>
                {studentReportCards.map(card => (
                  <li key={card.id} style={styles.listItem}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <strong>{card.term_name}</strong>
                      <div>
                        <button style={{ ...styles.secondaryBtn, marginRight: 6 }} onClick={() => startEditReportCard(card)}>
                          Edit
                        </button>
                        <button
                          style={{ ...styles.secondaryBtn, background: "#dc2626", color: "#fff" }}
                          onClick={() => deleteReportCard(card.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {card.subjects.map(s => (
                      <div key={s.id} style={{ fontSize: 14, marginTop: 4 }}>
                        <strong>{s.subject_name}:</strong> {s.grade}
                        {s.comment && <div style={{ fontSize: 13, color: "#64748b" }}>{s.comment}</div>}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}

            <h4 style={{ marginBottom: 8 }}>{editingReportCardId ? "Edit Report Card" : "Add Report Card"}</h4>

            <form onSubmit={submitReportCard} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {!editingReportCardId && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontWeight: 600 }}>Term</label>
                  <select value={reportCardTermId} onChange={e => setReportCardTermId(e.target.value)} style={styles.input} required>
                    <option value="">Select a term...</option>
                    {terms.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {terms.length === 0 && (
                    <span style={{ fontSize: 13, color: "#94a3b8" }}>
                      No terms set up yet — add one from the Report Card Terms panel.
                    </span>
                  )}
                </div>
              )}

              {reportCardSubjects.map((row, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input
                    value={row.subject_name}
                    onChange={e => updateSubjectRow(i, "subject_name", e.target.value)}
                    style={{ ...styles.input, flex: 2 }}
                    placeholder="Subject"
                  />
                  <input
                    value={row.grade}
                    onChange={e => updateSubjectRow(i, "grade", e.target.value)}
                    style={{ ...styles.input, flex: 1 }}
                    placeholder="Grade"
                  />
                  <input
                    value={row.comment}
                    onChange={e => updateSubjectRow(i, "comment", e.target.value)}
                    style={{ ...styles.input, flex: 3 }}
                    placeholder="Comment (optional)"
                  />
                  <button
                    type="button"
                    onClick={() => removeSubjectRow(i)}
                    style={{ ...styles.secondaryBtn, marginTop: 0 }}
                    aria-label="Remove subject"
                  >
                    ×
                  </button>
                </div>
              ))}

              <button type="button" onClick={addSubjectRow} style={{ ...styles.secondaryBtn, alignSelf: "flex-start" }}>
                + Add Subject
              </button>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...styles.actionBtn, marginTop: 0 }}>
                  {editingReportCardId ? "Save Changes" : "Create Report Card"}
                </button>
                {editingReportCardId && (
                  <button type="button" onClick={resetReportCardForm} style={{ ...styles.secondaryBtn, marginTop: 0 }}>
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>

            <button
              onClick={closeReportCardModal}
              style={{
                marginTop: 20,
                background: "#334155",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: 6,
                cursor: "pointer",
                width: "100%"
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportCardsSection;
