import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { dashboardStyles as styles } from "../../styles/dashboardStyles";
import BaseDashboard, { DashboardNavItem } from "../../components/BaseDashboard";
import { useConfirm } from "../../components/ConfirmDialog";
import { formatDate } from "../../utils/formatDate";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { downloadCsv } from "../../utils/downloadCsv";
import { usePolling } from "../../hooks/usePolling";

const POLL_INTERVAL_MS = 30000;

type SectionKey = "dashboard" | "classes" | "attendance" | "tasks" | "report" | "notifications" | "reportCards";

interface ClassItem {
  id: number;
  class_name: string;
  year_group: string;
}

interface AttendanceStudent {
  id: number;
  first_name: string;
  surname: string;
  attendance_status?: string;
}

interface ParentContact {
  first_name: string;
  middle_name: string | null;
  surname: string;
  relationship_to_student: string | null;
  contact_number: string | null;
  email: string | null;
}

interface TaskItem {
  id: number;
  title: string;
  description: string;
  due_date: string;
  class_name: string;
  student_id?: number | null;
  student_name?: string | null;
}

interface StudentNote {
  id: number;
  note: string;
  created_at: string;
  author_first_name: string;
  author_last_name: string;
}

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
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

interface AttendanceHistoryRow {
  date: string;
  present_count: number;
  absent_count: number;
  total_count: number;
}

interface NotificationItem {
  id: number;
  audience: "parent" | "staff";
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  sender_first_name: string;
  sender_last_name: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const BASE_NAV_ITEMS: DashboardNavItem[] = [
  { key: "dashboard", icon: "🏠", label: "Dashboard" },
  { key: "classes", icon: "🏫", label: "My Classes" },
  { key: "attendance", icon: "📋", label: "Attendance" },
  { key: "tasks", icon: "📝", label: "Tasks" }
];

const SECTION_TITLES: Record<SectionKey, string> = {
  dashboard: "Dashboard",
  classes: "My Classes",
  attendance: "Attendance",
  tasks: "Tasks",
  report: "Attendance Report",
  notifications: "Notifications",
  reportCards: "Report Cards"
};

const TeacherDashboard: React.FC = () => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [attendanceClassId, setAttendanceClassId] = useState<number | null>(null);
  const [attendanceDate, setAttendanceDate] = useState<string>(todayStr());
  const [attendanceStudents, setAttendanceStudents] = useState<AttendanceStudent[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [detailView, setDetailView] = useState<{ date: string; students: AttendanceStudent[] } | null>(null);
  const [detailViewLoading, setDetailViewLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [notesStudent, setNotesStudent] = useState<AttendanceStudent | null>(null);
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const [parentContactStudent, setParentContactStudent] = useState<AttendanceStudent | null>(null);
  const [parentContacts, setParentContacts] = useState<ParentContact[]>([]);
  const [parentContactLoading, setParentContactLoading] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [homeworkForm, setHomeworkForm] = useState({ title: "", description: "", due_date: "" });

  const [terms, setTerms] = useState<Term[]>([]);
  const [reportCardStudent, setReportCardStudent] = useState<AttendanceStudent | null>(null);
  const [studentReportCards, setStudentReportCards] = useState<ReportCard[]>([]);
  const [reportCardsLoading, setReportCardsLoading] = useState(false);
  const [editingReportCardId, setEditingReportCardId] = useState<number | null>(null);
  const [reportCardTermId, setReportCardTermId] = useState("");
  const [reportCardSubjects, setReportCardSubjects] = useState<SubjectFormRow[]>([emptySubjectRow()]);
  const [reportCardsClassId, setReportCardsClassId] = useState("");
  const [reportCardsRoster, setReportCardsRoster] = useState<AttendanceStudent[]>([]);
  const [reportCardsRosterLoading, setReportCardsRosterLoading] = useState(false);

  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [reportClassId, setReportClassId] = useState<string>("");
  const [reportDownloading, setReportDownloading] = useState(false);

  const [selectedSection, setSelectedSection] = useState<SectionKey>("dashboard");

  const [taskForm, setTaskForm] = useState({
    classId: "",
    title: "",
    description: "",
    due_date: ""
  });

  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const { confirm, ConfirmDialog } = useConfirm();

  const loadDashboard = async () => {
    try {
      const classRes = await api.get("/teacher/classes");
      const taskRes = await api.get("/teacher/tasks");
      const featuresRes = await api.get("/features");
      const notificationsRes = await api.get("/notifications");
      const termsRes = await api.get("/report-cards/terms");

      setClasses(classRes.data.classes || []);
      setTasks(taskRes.data.tasks || []);
      setFeatures(featuresRes.data.flags || {});
      setNotifications(notificationsRes.data || []);
      setTerms(termsRes.data.terms || []);
      setLoadError(null);
    } catch (err) {
      console.error("Teacher dashboard error:", err);
      setLoadError(getErrorMessage(err, "Failed to load dashboard data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  usePolling(loadDashboard, POLL_INTERVAL_MS);

  const loadAttendanceHistory = async (classId: number) => {
    try {
      const res = await api.get(`/teacher/attendance/${classId}/history`);
      setAttendanceHistory(res.data.history || []);
    } catch (err) {
      console.error("Attendance history load error:", err);
      setLoadError(getErrorMessage(err, "Failed to load attendance history"));
    }
  };

  const loadAttendance = async (classId: number, date: string = todayStr()) => {
    setSelectedSection("attendance");
    setAttendanceClassId(classId);
    setAttendanceDate(date);
    setAttendanceLoading(true);

    try {
      const res = await api.get(`/teacher/attendance/${classId}`, { params: { date } });
      setAttendanceStudents(res.data.students || []);
    } catch (err) {
      console.error("Attendance load error:", err);
      setLoadError(getErrorMessage(err, "Failed to load attendance"));
    } finally {
      setAttendanceLoading(false);
    }

    loadAttendanceHistory(classId);
  };

  const openDetailView = async (date: string) => {
    if (!attendanceClassId) return;
    setDetailView({ date, students: [] });
    setDetailViewLoading(true);

    try {
      const res = await api.get(`/teacher/attendance/${attendanceClassId}`, { params: { date } });
      setDetailView({ date, students: res.data.students || [] });
    } catch (err) {
      console.error("Attendance detail view error:", err);
      setLoadError(getErrorMessage(err, "Failed to load attendance detail"));
      setDetailView(null);
    } finally {
      setDetailViewLoading(false);
    }
  };

  const markAttendance = async (studentId: number, status: string) => {
    if (!attendanceClassId) return;

    try {
      await api.post(`/teacher/attendance/mark`, {
        classId: attendanceClassId,
        studentId,
        status,
        date: attendanceDate
      });

      setAttendanceStudents(prev =>
        prev.map(s =>
          s.id === studentId ? { ...s, attendance_status: status.toUpperCase() } : s
        )
      );
      setSuccessMessage(
        attendanceDate === todayStr()
          ? "Attendance marked successfully."
          : `Attendance for ${attendanceDate} updated successfully.`
      );
      loadAttendanceHistory(attendanceClassId);
    } catch (err) {
      console.error("Attendance mark error:", err);
      setLoadError(getErrorMessage(err, "Failed to mark attendance"));
    }
  };

  const openNotesModal = async (student: AttendanceStudent) => {
    setNotesStudent(student);
    setStudentNotes([]);
    setNewNoteText("");
    setHomeworkForm({ title: "", description: "", due_date: "" });
    setNotesLoading(true);

    try {
      const res = await api.get(`/notes/students/${student.id}`);
      setStudentNotes(res.data.notes || []);
    } catch (err) {
      console.error("Load student notes error:", err);
      setLoadError(getErrorMessage(err, "Failed to load notes"));
    } finally {
      setNotesLoading(false);
    }
  };

  const closeNotesModal = () => {
    setNotesStudent(null);
    setStudentNotes([]);
  };

  const openParentContactModal = async (student: AttendanceStudent) => {
    setParentContactStudent(student);
    setParentContacts([]);
    setParentContactLoading(true);

    try {
      const res = await api.get(
        `/teacher/classes/${attendanceClassId}/students/${student.id}/parent-contacts`
      );
      setParentContacts(res.data.guardians || []);
    } catch (err) {
      console.error("Load parent contacts error:", err);
      setLoadError(getErrorMessage(err, "Failed to load parent contact info"));
    } finally {
      setParentContactLoading(false);
    }
  };

  const closeParentContactModal = () => {
    setParentContactStudent(null);
    setParentContacts([]);
  };

  const resetReportCardForm = () => {
    setEditingReportCardId(null);
    setReportCardTermId("");
    setReportCardSubjects([emptySubjectRow()]);
  };

  const openReportCardModal = async (student: AttendanceStudent) => {
    setReportCardStudent(student);
    setStudentReportCards([]);
    resetReportCardForm();
    setReportCardsLoading(true);

    try {
      const res = await api.get(`/report-cards/students/${student.id}`);
      setStudentReportCards(res.data.reportCards || []);
    } catch (err) {
      console.error("Load report cards error:", err);
      setLoadError(getErrorMessage(err, "Failed to load report cards"));
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
    const res = await api.get(`/report-cards/students/${reportCardStudent.id}`);
    setStudentReportCards(res.data.reportCards || []);
  };

  const submitReportCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportCardStudent) return;

    const subjects = reportCardSubjects
      .filter(s => s.subject_name.trim() && s.grade.trim())
      .map(s => ({ subject_name: s.subject_name.trim(), grade: s.grade.trim(), comment: s.comment.trim() || undefined }));

    if (subjects.length === 0) {
      setLoadError("At least one subject with a name and grade is required.");
      return;
    }

    try {
      if (editingReportCardId) {
        await api.put(`/report-cards/${editingReportCardId}`, { subjects });
        setSuccessMessage("Report card updated.");
      } else {
        if (!reportCardTermId) {
          setLoadError("Please select a term.");
          return;
        }
        await api.post(`/report-cards/students/${reportCardStudent.id}`, {
          term_id: Number(reportCardTermId),
          subjects
        });
        setSuccessMessage("Report card created.");
      }
      await reloadReportCards();
      resetReportCardForm();
    } catch (err) {
      console.error("Save report card error:", err);
      setLoadError(getErrorMessage(err, "Failed to save report card"));
    }
  };

  const deleteReportCard = async (id: number) => {
    if (!(await confirm("Are you sure you want to delete this report card?"))) return;

    try {
      await api.delete(`/report-cards/${id}`);
      setSuccessMessage("Report card deleted.");
      await reloadReportCards();
      if (editingReportCardId === id) resetReportCardForm();
    } catch (err) {
      console.error("Delete report card error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete report card"));
    }
  };

  const loadReportCardsRoster = async (classId: string) => {
    setReportCardsClassId(classId);
    setReportCardsRoster([]);
    if (!classId) return;

    setReportCardsRosterLoading(true);
    try {
      const res = await api.get(`/teacher/attendance/${classId}`, { params: { date: todayStr() } });
      setReportCardsRoster(res.data.students || []);
    } catch (err) {
      console.error("Load class roster error:", err);
      setLoadError(getErrorMessage(err, "Failed to load class roster"));
    } finally {
      setReportCardsRosterLoading(false);
    }
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notesStudent || !newNoteText.trim()) return;

    try {
      await api.post(`/notes/students/${notesStudent.id}`, { note: newNoteText.trim() });
      const res = await api.get(`/notes/students/${notesStudent.id}`);
      setStudentNotes(res.data.notes || []);
      setNewNoteText("");
      setSuccessMessage("Note added.");
    } catch (err) {
      console.error("Add note error:", err);
      setLoadError(getErrorMessage(err, "Failed to add note"));
    }
  };

  const setIndependentHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notesStudent || !attendanceClassId) return;

    try {
      await api.post("/teacher/tasks/create", {
        classId: attendanceClassId,
        studentId: notesStudent.id,
        title: homeworkForm.title,
        description: homeworkForm.description,
        due_date: homeworkForm.due_date
      });

      const taskRes = await api.get("/teacher/tasks");
      setTasks(taskRes.data.tasks || []);

      setHomeworkForm({ title: "", description: "", due_date: "" });
      setSuccessMessage("Independent homework set.");
    } catch (err) {
      console.error("Independent homework create error:", err);
      setLoadError(getErrorMessage(err, "Failed to set independent homework"));
    }
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/teacher/tasks/create", {
        classId: taskForm.classId,
        title: taskForm.title,
        description: taskForm.description,
        due_date: taskForm.due_date
      });

      const taskRes = await api.get("/teacher/tasks");
      setTasks(taskRes.data.tasks || []);

      setSuccessMessage("Task created successfully.");
      setTaskForm({ classId: "", title: "", description: "", due_date: "" });
    } catch (err) {
      console.error("Task create error:", err);
      setLoadError(getErrorMessage(err, "Failed to create task"));
    }
  };

  const deleteTask = async (taskId: number) => {
    if (!(await confirm("Are you sure you want to delete this task?"))) return;

    try {
      await api.delete(`/teacher/tasks/${taskId}`);

      setTasks(prev => prev.filter(t => t.id !== taskId));
      setSuccessMessage("Task deleted successfully.");
    } catch (err) {
      console.error("Task delete error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete task"));
    }
  };

  const downloadAttendanceReport = async () => {
    if (!reportClassId) {
      setLoadError("Please select a class first.");
      return;
    }

    setReportDownloading(true);
    const result = await downloadCsv(
      "/teacher/attendance/report",
      { classId: reportClassId },
      `attendance_report_class${reportClassId}.csv`
    );
    setReportDownloading(false);

    if (result.ok) {
      setSuccessMessage("Attendance report downloaded.");
    } else {
      setLoadError(result.message);
    }
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

  let navItems = features.attendance_report
    ? [...BASE_NAV_ITEMS, { key: "report", icon: "📊", label: "Attendance Report" }]
    : BASE_NAV_ITEMS;
  if (features.notifications) {
    navItems = [...navItems, { key: "notifications", icon: "📣", label: "Notifications" }];
  }
  if (features.report_cards) {
    navItems = [...navItems, { key: "reportCards", icon: "🎓", label: "Report Cards" }];
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
      {ConfirmDialog}

      {/* ---------------------- DASHBOARD SECTION ---------------------- */}
      {selectedSection === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Welcome to your Teacher Dashboard</h3>
            <p style={styles.text}>
              From here you can manage your classes, take attendance, and assign tasks
              to your students. Use the sidebar to navigate between sections.
            </p>
          </div>
        </div>
      )}

      {/* ---------------------- CLASSES SECTION ---------------------- */}
      {selectedSection === "classes" && (
        <div style={styles.card}>
          {classes.length === 0 ? (
            <p style={styles.text}>You are not assigned to any classes.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Class Name</th>
                  <th style={{ textAlign: "left" }}>Year Group</th>
                  <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {classes.map(cls => (
                  <tr key={cls.id}>
                    <td>
                      <strong>{cls.class_name}</strong>
                    </td>
                    <td>{cls.year_group}</td>
                    <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      <button
                        style={{ ...styles.actionBtn, marginTop: 0 }}
                        onClick={() => loadAttendance(cls.id)}
                      >
                        View Attendance
                      </button>

                      <button
                        style={{ ...styles.actionBtn, marginTop: 0, marginLeft: 8 }}
                        onClick={() => {
                          setTaskForm(prev => ({
                            ...prev,
                            classId: String(cls.id)
                          }));
                          setSelectedSection("tasks");
                        }}
                      >
                        Set Task
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

      {/* ---------------------- ATTENDANCE SECTION ---------------------- */}
      {selectedSection === "attendance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Daily Register</h3>

            <div
              className="form-row"
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                alignItems: "flex-end",
                marginBottom: 20
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Class</label>
                <select
                  value={attendanceClassId ?? ""}
                  onChange={e =>
                    e.target.value && loadAttendance(Number(e.target.value), attendanceDate)
                  }
                  style={styles.input}
                >
                  <option value="">Select class</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.class_name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Date</label>
                <input
                  type="date"
                  value={attendanceDate}
                  max={todayStr()}
                  onChange={e =>
                    attendanceClassId && loadAttendance(attendanceClassId, e.target.value)
                  }
                  style={styles.input}
                  disabled={!attendanceClassId}
                />
              </div>

              {attendanceClassId && attendanceDate !== todayStr() && (
                <button
                  style={styles.actionBtn}
                  onClick={() => loadAttendance(attendanceClassId, todayStr())}
                >
                  Jump to Today
                </button>
              )}
            </div>

            {!attendanceClassId ? (
              <p style={styles.text}>
                Select a class above (or "View Attendance" from My Classes) to take or view the
                register.
              </p>
            ) : attendanceLoading ? (
              <p style={styles.text}>Loading register...</p>
            ) : attendanceStudents.length === 0 ? (
              <p style={styles.text}>No students found for this class.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...styles.table, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Student</th>
                      <th style={{ textAlign: "left" }}>Status</th>
                      <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {attendanceStudents.map(st => (
                      <tr key={st.id}>
                        <td>
                          <strong>
                            {st.first_name} {st.surname}
                          </strong>
                        </td>
                        <td>
                          {st.attendance_status === "PRESENT"
                            ? "Present"
                            : st.attendance_status === "ABSENT"
                            ? "Absent"
                            : "Not marked"}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", gap: 8 }}>
                            <button
                              style={{
                                ...styles.presentBtn,
                                marginTop: 0,
                                marginRight: 0,
                                opacity: st.attendance_status === "PRESENT" ? 1 : 0.55
                              }}
                              onClick={() => markAttendance(st.id, "present")}
                            >
                              Present
                            </button>

                            <button
                              style={{
                                ...styles.absentBtn,
                                marginTop: 0,
                                opacity: st.attendance_status === "ABSENT" ? 1 : 0.55
                              }}
                              onClick={() => markAttendance(st.id, "absent")}
                            >
                              Absent
                            </button>

                            {features.student_notes && (
                              <button
                                style={{ ...styles.actionBtn, marginTop: 0, marginRight: 0 }}
                                onClick={() => openNotesModal(st)}
                              >
                                Notes & Homework
                              </button>
                            )}

                            {features.report_cards && (
                              <button
                                style={{ ...styles.actionBtn, marginTop: 0, marginRight: 0 }}
                                onClick={() => openReportCardModal(st)}
                              >
                                Report Card
                              </button>
                            )}

                            <button
                              style={{ ...styles.actionBtn, marginTop: 0, marginRight: 0 }}
                              onClick={() => openParentContactModal(st)}
                            >
                              Parent Contact
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Attendance History</h3>

            {!attendanceClassId ? (
              <p style={styles.text}>Select a class above to view past attendance.</p>
            ) : attendanceHistory.length === 0 ? (
              <p style={styles.text}>No attendance has been recorded for this class yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...styles.table, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Date</th>
                      <th style={{ textAlign: "left" }}>Present</th>
                      <th style={{ textAlign: "left" }}>Absent</th>
                      <th style={{ textAlign: "left" }}>Total</th>
                      <th style={{ textAlign: "center", width: 220 }}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {attendanceHistory.map(row => (
                      <tr key={row.date}>
                        <td>
                          <strong>{formatDate(row.date)}</strong>
                          {row.date === todayStr() && " (Today)"}
                        </td>
                        <td>{row.present_count}</td>
                        <td>{row.absent_count}</td>
                        <td>{row.total_count}</td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                            <button
                              style={{ ...styles.actionBtn, marginTop: 0, marginRight: 0 }}
                              onClick={() => openDetailView(row.date)}
                            >
                              View in Detail
                            </button>

                            <button
                              style={{ ...styles.actionBtn, marginTop: 0, marginRight: 0 }}
                              onClick={() => loadAttendance(attendanceClassId!, row.date)}
                            >
                              Edit Register
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------- ATTENDANCE DETAIL VIEW MODAL ---------------------- */}
      {detailView && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
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
              Attendance for {formatDate(detailView.date)}
              {detailView.date === todayStr() && " (Today)"}
            </h3>

            {detailViewLoading ? (
              <p style={styles.text}>Loading...</p>
            ) : detailView.students.length === 0 ? (
              <p style={styles.text}>No students found for this class.</p>
            ) : (
              <ul style={styles.list}>
                {detailView.students.map(st => (
                  <li
                    key={st.id}
                    style={{
                      ...styles.listItem,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12
                    }}
                  >
                    <span>
                      {st.first_name} {st.surname}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color:
                          st.attendance_status === "PRESENT"
                            ? "#16a34a"
                            : st.attendance_status === "ABSENT"
                            ? "#dc2626"
                            : "#6b7280"
                      }}
                    >
                      {st.attendance_status === "PRESENT"
                        ? "Present"
                        : st.attendance_status === "ABSENT"
                        ? "Absent"
                        : "Not marked"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setDetailView(null)}
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

      {/* ---------------------- NOTES & INDEPENDENT HOMEWORK MODAL ---------------------- */}
      {notesStudent && (
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
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 16 }}>
              {notesStudent.first_name} {notesStudent.surname}
            </h3>

            <h4 style={{ marginBottom: 8 }}>Notes</h4>
            <p style={{ ...styles.text, fontSize: 13, color: "#64748b" }}>
              Only visible to school staff and this student's parent.
            </p>

            {notesLoading ? (
              <p style={styles.text}>Loading notes...</p>
            ) : studentNotes.length === 0 ? (
              <p style={styles.text}>No notes yet.</p>
            ) : (
              <ul style={{ ...styles.list, marginBottom: 16 }}>
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

            <form onSubmit={addNote} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              <textarea
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                style={{ ...styles.input, resize: "vertical" }}
                rows={3}
                placeholder="Add a note about this student..."
                required
              />
              <button style={styles.actionBtn}>Add Note</button>
            </form>

            <h4 style={{ marginBottom: 8 }}>Set Independent Homework</h4>
            <p style={{ ...styles.text, fontSize: 13, color: "#64748b" }}>
              Assigned to {notesStudent.first_name} only, not the whole class.
            </p>

            <form onSubmit={setIndependentHomework} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Title</label>
                <input
                  value={homeworkForm.title}
                  onChange={e => setHomeworkForm(prev => ({ ...prev, title: e.target.value }))}
                  style={styles.input}
                  placeholder="Homework title"
                  required
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Description</label>
                <textarea
                  value={homeworkForm.description}
                  onChange={e => setHomeworkForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{ ...styles.input, resize: "vertical" }}
                  rows={3}
                  placeholder="Homework description"
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Due Date</label>
                <input
                  type="date"
                  value={homeworkForm.due_date}
                  onChange={e => setHomeworkForm(prev => ({ ...prev, due_date: e.target.value }))}
                  style={styles.input}
                  required
                />
              </div>

              <button style={styles.actionBtn}>Set Homework</button>
            </form>

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

      {/* ---------------------- PARENT CONTACT MODAL ---------------------- */}
      {parentContactStudent && (
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
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 16 }}>
              {parentContactStudent.first_name} {parentContactStudent.surname} — Parent Contact
            </h3>

            {parentContactLoading ? (
              <p style={styles.text}>Loading contact info...</p>
            ) : parentContacts.length === 0 ? (
              <p style={styles.text}>No approved guardian on record.</p>
            ) : (
              parentContacts.map((g, gIdx) => (
                <div key={gIdx} style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 18, marginBottom: 10, color: "#4c1d95" }}>
                    Guardian {gIdx + 1}
                  </h4>
                  <div>
                    <strong>Name:</strong> {g.first_name} {g.surname}
                  </div>
                  <div>
                    <strong>Relationship:</strong> {g.relationship_to_student || "—"}
                  </div>
                  <div>
                    <strong>Phone Number:</strong> {g.contact_number || "—"}
                  </div>
                  <div>
                    <strong>Email:</strong> {g.email || "—"}
                  </div>
                </div>
              ))
            )}

            <button
              onClick={closeParentContactModal}
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

      {/* ---------------------- REPORT CARD MODAL ---------------------- */}
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
              Report Cards — {reportCardStudent.first_name} {reportCardStudent.surname}
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
                  <select
                    value={reportCardTermId}
                    onChange={e => setReportCardTermId(e.target.value)}
                    style={styles.input}
                    required
                  >
                    <option value="">Select a term...</option>
                    {terms.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {terms.length === 0 && (
                    <span style={{ fontSize: 13, color: "#94a3b8" }}>No terms set up yet — ask an admin to create one.</span>
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

      {/* ---------------------- TASKS SECTION ---------------------- */}
      {selectedSection === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* CREATE TASK FORM */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Create Task</h3>

            <form
              onSubmit={createTask}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                maxWidth: 500
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Class</label>
                <select
                  value={taskForm.classId}
                  onChange={e =>
                    setTaskForm(prev => ({
                      ...prev,
                      classId: e.target.value
                    }))
                  }
                  style={styles.input}
                  required
                >
                  <option value="">Select class</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.class_name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Title</label>
                <input
                  value={taskForm.title}
                  onChange={e =>
                    setTaskForm(prev => ({ ...prev, title: e.target.value }))
                  }
                  style={styles.input}
                  placeholder="Task title"
                  required
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={e =>
                    setTaskForm(prev => ({
                      ...prev,
                      description: e.target.value
                    }))
                  }
                  style={{ ...styles.input, resize: "vertical" }}
                  rows={3}
                  placeholder="Task description"
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Due Date</label>
                <input
                  type="date"
                  value={taskForm.due_date}
                  onChange={e =>
                    setTaskForm(prev => ({
                      ...prev,
                      due_date: e.target.value
                    }))
                  }
                  style={styles.input}
                  required
                />
              </div>

              <button style={styles.actionBtn}>Create Task</button>
            </form>
          </div>

          {/* TASK LIST */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Tasks Assigned</h3>

            {tasks.length === 0 ? (
              <p style={styles.text}>No tasks assigned yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
              <table style={{ ...styles.table, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Title</th>
                    <th style={{ textAlign: "left" }}>Class</th>
                    <th style={{ textAlign: "left" }}>For</th>
                    <th style={{ textAlign: "left" }}>Due Date</th>
                    <th style={{ textAlign: "left" }}>Description</th>
                    <th style={{ textAlign: "center", width: 120 }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {tasks.map(task => (
                    <tr key={task.id}>
                      <td>
                        <strong>{task.title}</strong>
                      </td>
                      <td>{task.class_name}</td>
                      <td>{task.student_name || "Whole class"}</td>
                      <td>{formatDate(task.due_date)}</td>
                      <td>{task.description}</td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          style={styles.absentBtn}
                          onClick={() => deleteTask(task.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------- ATTENDANCE REPORT SECTION ---------------------- */}
      {selectedSection === "report" && features.attendance_report && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Download Attendance Report</h3>

            <p style={{ marginBottom: 16, color: "#475569" }}>
              Export a CSV of attendance for one of your classes, covering the
              last 365 days.
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
                  <option value="">Select class</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.class_name}
                    </option>
                  ))}
                </select>
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
      )}

      {/* ---------------------- NOTIFICATIONS ---------------------- */}
      {selectedSection === "notifications" && features.notifications && (
        <div style={styles.card}>
          <h3 style={{ marginBottom: 16 }}>Notifications</h3>

          {notifications.length === 0 ? (
            <p style={styles.text}>You have no notifications yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {notifications.map(n => {
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

      {/* ---------------------- REPORT CARDS SECTION ---------------------- */}
      {selectedSection === "reportCards" && features.report_cards && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Report Cards</h3>
            <p style={{ ...styles.text, fontSize: 13, color: "#64748b" }}>
              Pick a class to see its students, then manage report cards for one of them.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 320 }}>
              <label style={{ fontWeight: 600 }}>Class</label>
              <select
                value={reportCardsClassId}
                onChange={e => loadReportCardsRoster(e.target.value)}
                style={styles.input}
              >
                <option value="">Select a class...</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.class_name}
                  </option>
                ))}
              </select>
            </div>

            {reportCardsClassId && (
              <div style={{ marginTop: 20, overflowX: "auto" }}>
                {reportCardsRosterLoading ? (
                  <p style={styles.text}>Loading students...</p>
                ) : reportCardsRoster.length === 0 ? (
                  <p style={styles.text}>No students in this class.</p>
                ) : (
                  <table style={{ ...styles.table, width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Student Name</th>
                        <th style={{ textAlign: "center", width: 160 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportCardsRoster.map(st => (
                        <tr key={st.id}>
                          <td>
                            <strong>
                              {st.first_name} {st.surname}
                            </strong>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <button style={{ ...styles.actionBtn, marginTop: 0 }} onClick={() => openReportCardModal(st)}>
                              Report Card
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </BaseDashboard>
  );
};

export default TeacherDashboard;
