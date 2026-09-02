import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { dashboardStyles as styles } from "../../styles/dashboardStyles";
import { publicStyles } from "../../styles/publicStyles";
import BaseDashboard, { DashboardNavItem } from "../../components/BaseDashboard";
import ChildFormFields from "../../components/ChildFormFields";
import DirectDebitSection from "../../components/DirectDebitSection";
import { emptyChildForm, validateChildForm } from "../../utils/childForm";
import { formatDate } from "../../utils/formatDate";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { usePolling } from "../../hooks/usePolling";

const POLL_INTERVAL_MS = 30000;

interface Child {
  id: number;
  first_name: string;
  middle_name?: string;
  surname: string;
  gender: string;
  date_of_birth: string;
  guardian_code?: string;
  // if your /parent/children endpoint later returns class_name, you can add:
  // class_name?: string;
}

interface Task {
  id: number;
  title: string;
  child_name: string;
  due_date: string;
  description: string;
  is_independent?: boolean | number;
}

interface StudentNote {
  id: number;
  note: string;
  created_at: string;
  author_first_name: string;
  author_last_name: string;
}

interface ReportCardSubject {
  id: number;
  subject_name: string;
  grade: string;
  comment: string | null;
}

interface ReportCard {
  id: number;
  term_name: string;
  subjects: ReportCardSubject[];
}

interface ScheduleSlot {
  slot_date: string;
  start_time: string;
  end_time: string;
  class_name: string;
  subject_name: string | null;
  teacher_first_name: string;
  teacher_surname: string;
}

interface ChildSchedule {
  student_id: number;
  child_name: string;
  slots: ScheduleSlot[];
}

type SectionKey = "dashboard" | "children" | "tasks" | "addChild" | "notifications" | "reportCards" | "directDebit";

const BASE_NAV_ITEMS: DashboardNavItem[] = [
  { key: "dashboard", icon: "🏠", label: "Dashboard" },
  { key: "children", icon: "👨‍👧", label: "Your Children" },
  { key: "tasks", icon: "📝", label: "Tasks & Homework" },
  { key: "addChild", icon: "➕", label: "Add Child" }
];

const SECTION_TITLES: Record<SectionKey, string> = {
  dashboard: "Dashboard",
  children: "Your Children",
  tasks: "Tasks & Homework",
  addChild: "Add a New Child",
  notifications: "Notifications",
  reportCards: "Report Cards",
  directDebit: "Direct Debit"
};

const ParentDashboard: React.FC = () => {
  const [children, setChildren] = useState<Child[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [notesChild, setNotesChild] = useState<Child | null>(null);
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const [reportCardChild, setReportCardChild] = useState<Child | null>(null);
  const [childReportCards, setChildReportCards] = useState<ReportCard[]>([]);
  const [reportCardsLoading, setReportCardsLoading] = useState(false);

  const [schedule, setSchedule] = useState<ChildSchedule[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);

  const [selectedSection, setSelectedSection] =
    useState<SectionKey>("dashboard");

  // Add Child form — shares its fields/validation with the public register page
  const [newChild, setNewChild] = useState({ ...emptyChildForm });
  const [addChildMode, setAddChildMode] = useState<"new" | "link">("new");
  const [linkGuardianCode, setLinkGuardianCode] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<any[]>([]);

  const updateNewChild = (field: string, value: string) => {
    setNewChild(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: "" }));
    setFormError("");
  };

  const validateChild = () => {
    const newErrors = validateChildForm(newChild);
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setFormError("Please fix the errors below before submitting.");
      return false;
    }

    return true;
  };

  const loadDashboard = async () => {
    try {
      const childRes = await api.get("/parent/children");
      const taskRes = await api.get("/parent/tasks");
      const notificationsRes = await api.get("/notifications");
      const featuresRes = await api.get("/features");

      setChildren(childRes.data.children || []);
      setTasks(taskRes.data.tasks || []);
      setNotifications(notificationsRes.data || []);
      setFeatures(featuresRes.data.flags || {});
      setLoadError(null);
    } catch (err) {
      console.error("Parent dashboard error:", err);
      setLoadError(getErrorMessage(err, "Failed to load dashboard data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  usePolling(loadDashboard, POLL_INTERVAL_MS);

  const loadSchedule = async () => {
    setScheduleLoading(true);
    try {
      const res = await api.get("/parent/schedule");
      setSchedule(res.data.schedule || []);
    } catch (err) {
      console.error("Load class schedule error:", err);
      setLoadError(getErrorMessage(err, "Failed to load class schedule"));
    } finally {
      setScheduleLoading(false);
    }
  };

  const toggleSchedule = () => {
    if (scheduleExpanded) {
      setScheduleExpanded(false);
      return;
    }
    setScheduleExpanded(true);
    loadSchedule();
  };

  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateChild()) return;

    try {
      const res = await api.post("/parent/add-child", newChild);

      setChildren(res.data.children);

      setNewChild({ ...emptyChildForm });

      setErrors({});
      setFormError("");

      setSuccessMessage("Child added successfully.");
      setSelectedSection("children");
    } catch (err) {
      console.error("Add child error:", err);
      setFormError(getErrorMessage(err, "Failed to add child. Please try again."));
    }
  };

  const handleLinkGuardian = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!linkGuardianCode.trim()) {
      setFormError("Guardian code is required.");
      return;
    }

    try {
      await api.post("/parent/link-guardian", { guardian_code: linkGuardianCode.trim() });

      setLinkGuardianCode("");
      setFormError("");
      setSuccessMessage("Request submitted. Pending admin approval.");
    } catch (err) {
      console.error("Link guardian error:", err);
      setFormError(getErrorMessage(err, "Failed to submit guardian link request."));
    }
  };

  const openNotesModal = async (child: Child) => {
    setNotesChild(child);
    setStudentNotes([]);
    setNotesLoading(true);

    try {
      const res = await api.get(`/notes/students/${child.id}`);
      setStudentNotes(res.data.notes || []);
    } catch (err) {
      console.error("Load student notes error:", err);
      setLoadError(getErrorMessage(err, "Failed to load notes"));
    } finally {
      setNotesLoading(false);
    }
  };

  const closeNotesModal = () => {
    setNotesChild(null);
    setStudentNotes([]);
  };

  const openReportCardModal = async (child: Child) => {
    setReportCardChild(child);
    setChildReportCards([]);
    setReportCardsLoading(true);

    try {
      const res = await api.get(`/report-cards/students/${child.id}`);
      setChildReportCards(res.data.reportCards || []);
    } catch (err) {
      console.error("Load report cards error:", err);
      setLoadError(getErrorMessage(err, "Failed to load report cards"));
    } finally {
      setReportCardsLoading(false);
    }
  };

  const closeReportCardModal = () => {
    setReportCardChild(null);
    setChildReportCards([]);
  };

  const markNotificationRead = async (id: number) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    );
    try {
      await api.post(`/notifications/${id}/read`);
    } catch (err) {
      console.error("Mark notification read error:", err);
    }
  };

  let navItems = features.notifications
    ? [...BASE_NAV_ITEMS, { key: "notifications", icon: "📣", label: "Notifications" }]
    : BASE_NAV_ITEMS;
  if (features.report_cards) {
    navItems = [...navItems, { key: "reportCards", icon: "🎓", label: "Report Cards" }];
  }
  if (features.direct_debit) {
    navItems = [...navItems, { key: "directDebit", icon: "💳", label: "Direct Debit" }];
  }

  return (
    <BaseDashboard
      navItems={navItems}
      selectedSection={selectedSection}
      onSelectSection={key => setSelectedSection(key as SectionKey)}
      title={SECTION_TITLES[selectedSection]}
      loading={loading}
      error={loadError}
      onDismissError={() => setLoadError(null)}
      success={successMessage}
      onDismissSuccess={() => setSuccessMessage(null)}
    >
      {/* ---------------------- DASHBOARD SECTION ---------------------- */}
      {selectedSection === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Welcome Card */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Welcome to your Parent Dashboard</h3>

            <p style={styles.text}>
              This is your central hub for staying connected with your child’s school life.
              From here, you can view your linked children, check their class information,
              monitor tasks and homework, and stay updated with important school notices.
            </p>

            <p style={styles.text}>
              Use the sidebar to navigate between sections such as{" "}
              <strong>Your Children</strong>,{" "}
              <strong>Tasks & Homework</strong>, and{" "}
              <strong>Add Child</strong>.
            </p>
          </div>

          {/* Quick Overview Cards */}
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap"
            }}
          >
            {/* Children Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px" }}>
              <h4 style={{ marginBottom: 8 }}>Your Children</h4>
              <p style={styles.text}>
                View details about your linked children, including their personal
                information, classes, and school records.
              </p>
            </div>

            {/* Tasks Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px" }}>
              <h4 style={{ marginBottom: 8 }}>Tasks & Homework</h4>
              <p style={styles.text}>
                Stay updated with homework and tasks assigned to your children,
                including due dates and descriptions.
              </p>
            </div>

            {/* Add Child Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px" }}>
              <h4 style={{ marginBottom: 8 }}>Add Child</h4>
              <p style={styles.text}>
                Register additional children to your account and keep all school
                information in one place.
              </p>
            </div>
          </div>

          {/* Class Schedule Dropdown */}
          {features.timetable && (
            <div style={styles.card}>
              <div
                onClick={toggleSchedule}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              >
                <h4 style={{ margin: 0 }}>Class Schedule</h4>
                <button style={styles.secondaryBtn} onClick={toggleSchedule}>
                  {scheduleExpanded ? "▼ Hide" : "▶ View Schedule"}
                </button>
              </div>

              {scheduleExpanded && (
                <div style={{ marginTop: 16 }}>
                  {scheduleLoading ? (
                    <p style={styles.text}>Loading class schedule...</p>
                  ) : children.length === 0 ? (
                    <p style={styles.text}>No children linked to your account.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                      {children.map(child => {
                        const childSlots = schedule.find(s => s.student_id === child.id)?.slots || [];
                        return (
                          <div key={child.id}>
                            <p style={{ fontWeight: 600, marginBottom: 8 }}>
                              {child.first_name} {child.surname}
                            </p>
                            {childSlots.length === 0 ? (
                              <p style={styles.text}>No scheduled classes yet.</p>
                            ) : (
                              <div style={{ overflowX: "auto" }}>
                                <table style={{ ...styles.table, width: "100%" }}>
                                  <thead>
                                    <tr>
                                      <th style={{ textAlign: "left" }}>Date</th>
                                      <th style={{ textAlign: "left" }}>Time</th>
                                      <th style={{ textAlign: "left" }}>Class</th>
                                      <th style={{ textAlign: "left" }}>Subject</th>
                                      <th style={{ textAlign: "left" }}>Teacher</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...childSlots]
                                      .sort((a, b) => a.slot_date.localeCompare(b.slot_date) || a.start_time.localeCompare(b.start_time))
                                      .map((s, i) => (
                                        <tr key={i}>
                                          <td>{formatDate(s.slot_date)}</td>
                                          <td>
                                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                          </td>
                                          <td>{s.class_name}</td>
                                          <td>{s.subject_name || "—"}</td>
                                          <td>
                                            {s.teacher_first_name || s.teacher_surname
                                              ? `${s.teacher_first_name} ${s.teacher_surname}`
                                              : "—"}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------------- CHILDREN SECTION ---------------------- */}
      {selectedSection === "children" && (
        <div style={styles.card}>
          <h3 style={{ marginBottom: 16 }}>Children linked to your account</h3>

          {children.length === 0 ? (
            <p style={styles.text}>No children linked to your account.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Name</th>
                  <th style={{ textAlign: "left" }}>Gender</th>
                  <th style={{ textAlign: "left" }}>Date of Birth</th>
                  <th style={{ textAlign: "left" }}>Guardian Code</th>
                  {features.student_notes && <th style={{ textAlign: "center", width: 120 }}>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {children.map(child => (
                  <tr key={child.id}>
                    <td>
                      <strong>
                        {child.first_name} {child.surname}
                      </strong>
                    </td>
                    <td>{child.gender || "—"}</td>
                    <td>{formatDate(child.date_of_birth)}</td>
                    <td>
                      {child.guardian_code || "—"}
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Share with a second guardian</div>
                    </td>
                    {features.student_notes && (
                      <td style={{ textAlign: "center" }}>
                        <button style={styles.actionBtn} onClick={() => openNotesModal(child)}>
                          Notes
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {/* ---------------------- TASKS SECTION ---------------------- */}
      {selectedSection === "tasks" && (
        <div style={styles.card}>
          <h3 style={{ marginBottom: 16 }}>Tasks & Homework</h3>

          {tasks.length === 0 ? (
            <p style={styles.text}>No tasks assigned yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Title</th>
                  <th style={{ textAlign: "left" }}>Child</th>
                  <th style={{ textAlign: "left" }}>Type</th>
                  <th style={{ textAlign: "left" }}>Due Date</th>
                  <th style={{ textAlign: "left" }}>Description</th>
                </tr>
              </thead>

              <tbody>
                {tasks.map(task => (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.title}</strong>
                    </td>
                    <td>{task.child_name}</td>
                    <td>{task.is_independent ? "Independent" : "Class"}</td>
                    <td>{formatDate(task.due_date)}</td>
                    <td>{task.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {/* ---------------------- ADD CHILD SECTION (CENTERED + REGISTER LAYOUT + DROPDOWN) ---------------------- */}
      {selectedSection === "addChild" && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            width: "100%"
          }}
        >
          <div style={{ ...publicStyles.card, maxWidth: 500, width: "100%" }}>
            <h3 style={publicStyles.sectionTitle}>Add a Child</h3>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                style={{
                  ...publicStyles.secondaryBtn,
                  ...(addChildMode === "new" ? { background: "#2563eb", color: "#fff" } : {})
                }}
                onClick={() => {
                  setAddChildMode("new");
                  setFormError("");
                }}
              >
                Register a new child
              </button>
              <button
                type="button"
                style={{
                  ...publicStyles.secondaryBtn,
                  ...(addChildMode === "link" ? { background: "#2563eb", color: "#fff" } : {})
                }}
                onClick={() => {
                  setAddChildMode("link");
                  setFormError("");
                }}
              >
                Link to an existing child
              </button>
            </div>

            {formError && (
              <p style={{ ...publicStyles.text, color: "red", marginBottom: 12 }}>
                {formError}
              </p>
            )}

            {addChildMode === "new" ? (
              <form onSubmit={handleAddChild} style={publicStyles.form}>
                <div
                  style={{
                    padding: 12,
                    marginBottom: 12
                  }}
                >
                  <ChildFormFields value={newChild} onChange={updateNewChild} errors={errors} />
                </div>

                <button type="submit" style={publicStyles.actionBtn}>
                  Add Child
                </button>

                {/* Reset form) */}
                <button
                  type="button"
                  style={publicStyles.secondaryBtn}
                  onClick={() => {
                    setNewChild({ ...emptyChildForm });
                    setErrors({});
                    setFormError("");
                  }}
                >
                  Reset Form
                </button>
              </form>
            ) : (
              <form onSubmit={handleLinkGuardian} style={publicStyles.form}>
                <p style={{ ...publicStyles.text, marginBottom: 12 }}>
                  If this child is already registered under another guardian (e.g. a separated
                  parent), enter their guardian code here to request linking as an additional
                  guardian. This requires admin approval.
                </p>

                <div style={{ padding: 12, marginBottom: 12 }}>
                  <label style={publicStyles.label}>Guardian code</label>
                  <input
                    style={publicStyles.input}
                    value={linkGuardianCode}
                    onChange={e => setLinkGuardianCode(e.target.value)}
                    placeholder="Provided by the child's other guardian"
                  />
                </div>

                <button type="submit" style={publicStyles.actionBtn}>
                  Submit Request
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ---------------------- NOTIFICATIONS ---------------------- */}
      {selectedSection === "notifications" && features.notifications && (
        <div style={styles.card}>
          <h3 style={{ marginBottom: 16 }}>Notifications</h3>

          {notifications.length === 0 ? (
            <p style={styles.text}>You have no notifications yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {notifications.map((n: any) => {
                const isUnread = !n.read_at;
                return (
                  <div
                    key={n.id}
                    onClick={() => isUnread && markNotificationRead(n.id)}
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      borderLeft: isUnread ? "4px solid #2563eb" : "4px solid #e2e8f0",
                      background: isUnread ? "#eff6ff" : "#fff",
                      cursor: isUnread ? "pointer" : "default"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: isUnread ? 700 : 600 }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{formatDate(n.created_at)}</div>
                    </div>
                    <div style={{ marginTop: 6, color: "#334155" }}>{n.message}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
                      From {n.sender_first_name} {n.sender_last_name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* ---------------------- STUDENT NOTES MODAL (READ-ONLY) ---------------------- */}
      {notesChild && (
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
              maxWidth: 450,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 16 }}>
              Notes for {notesChild.first_name} {notesChild.surname}
            </h3>

            {notesLoading ? (
              <p style={styles.text}>Loading notes...</p>
            ) : studentNotes.length === 0 ? (
              <p style={styles.text}>No notes yet.</p>
            ) : (
              <ul style={styles.list}>
                {studentNotes.map(n => (
                  <li key={n.id} style={styles.listItem}>
                    <div>{n.note}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
                      {n.author_first_name} {n.author_last_name} · {formatDate(n.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={closeNotesModal}
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

      {/* ---------------------- DIRECT DEBIT SECTION ---------------------- */}
      {selectedSection === "directDebit" && features.direct_debit && <DirectDebitSection />}

      {/* ---------------------- REPORT CARDS SECTION ---------------------- */}
      {selectedSection === "reportCards" && features.report_cards && (
        <div style={styles.card}>
          <h3 style={{ marginBottom: 16 }}>Report Cards</h3>

          {children.length === 0 ? (
            <p style={styles.text}>No children linked to your account.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ ...styles.table, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Name</th>
                    <th style={{ textAlign: "center", width: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {children.map(child => (
                    <tr key={child.id}>
                      <td>
                        <strong>
                          {child.first_name} {child.surname}
                        </strong>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button style={styles.actionBtn} onClick={() => openReportCardModal(child)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {reportCardChild && (
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
              maxWidth: 450,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 16 }}>
              Report Cards — {reportCardChild.first_name} {reportCardChild.surname}
            </h3>

            {reportCardsLoading ? (
              <p style={styles.text}>Loading report cards...</p>
            ) : childReportCards.length === 0 ? (
              <p style={styles.text}>No report cards yet.</p>
            ) : (
              <ul style={styles.list}>
                {childReportCards.map(card => (
                  <li key={card.id} style={styles.listItem}>
                    <strong>{card.term_name}</strong>
                    {card.subjects.map(s => (
                      <div key={s.id} style={{ fontSize: 14, marginTop: 4 }}>
                        <strong>{s.subject_name}:</strong> {s.grade}
                        {s.comment && <div style={{ fontSize: 13, color: "#94a3b8" }}>{s.comment}</div>}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}

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
    </BaseDashboard>
  );
};

export default ParentDashboard;
