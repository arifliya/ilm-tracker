import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { dashboardStyles as styles } from "../../styles/dashboardStyles";
import BaseDashboard, { DashboardNavItem } from "../../components/BaseDashboard";
import SearchSort from "../../components/SearchSort";
import Pagination from "../../components/Pagination";
import { useConfirm } from "../../components/ConfirmDialog";
import { sortData, paginate } from "../../utils/tableHelpers";
import { formatDate } from "../../utils/formatDate";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { downloadCsv } from "../../utils/downloadCsv";
import { usePolling } from "../../hooks/usePolling";
import LineChart from "../../components/charts/LineChart";
import BarChart from "../../components/charts/BarChart";
import { parseCsv } from "../../utils/parseCsv";
import FeeTrackingSection from "../../components/FeeTrackingSection";

const PAGE_SIZE = 5;
const POLL_INTERVAL_MS = 30000;

const todayStr = () => new Date().toISOString().slice(0, 10);
const oneYearAgoStr = () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

type SectionKey =
  | "dashboard"
  | "class"
  | "teacher"
  | "sp"
  | "approvals"
  | "remove"
  | "report"
  | "notifications"
  | "reportCards"
  | "timetable"
  | "analytics"
  | "bulkUpload"
  | "fees"
  | "passwordManagement";

const BASE_NAV_ITEMS: DashboardNavItem[] = [
  { key: "dashboard", icon: "🏠", label: "Dashboard" },
  { key: "class", icon: "📚", label: "Class Management" },
  { key: "teacher", icon: "👨‍🏫", label: "Teacher Management" },
  { key: "sp", icon: "👨‍👩‍👧", label: "Student & Parent Overview" },
  { key: "approvals", icon: "📝", label: "Approvals" },
  { key: "remove", icon: "🗑️", label: "Remove Users" },
  { key: "bulkUpload", icon: "📤", label: "Import Students" }
];

const SECTION_TITLES: Record<SectionKey, string> = {
  dashboard: "Dashboard",
  class: "Class Management",
  teacher: "Teacher Management",
  sp: "Student & Parent Overview",
  approvals: "Approvals",
  remove: "Remove Users",
  report: "Attendance Report",
  notifications: "Notifications",
  reportCards: "Report Cards",
  timetable: "Timetable",
  analytics: "Analytics",
  bulkUpload: "Import Students",
  fees: "Fee Tracking",
  passwordManagement: "Password Management"
};

interface RoleItem {
  id: number;
  name: string;
}

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

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

interface SchoolEvent {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
}

interface TimetableSlot {
  id: number;
  term_id: number;
  term_name?: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  subject_name: string | null;
  teacher_id: number | null;
  teacher_first_name: string;
  teacher_surname: string;
}

interface CalendarSlot extends TimetableSlot {
  class_id: number;
  class_name: string;
}

const emptySlotForm = () => ({ slot_date: "", start_time: "", end_time: "", subject_name: "", teacher_id: "" });

const AdminDashboard: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [studentsParents, setStudentsParents] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [editingClass, setEditingClass] = useState<any | null>(null);

  const [assignStudentClassId, setAssignStudentClassId] = useState("");
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignedStudents, setAssignedStudents] = useState<any[]>([]);

  const [newClassName, setNewClassName] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [newClassYearGroup, setNewClassYearGroup] = useState("");
  const [newClassDescription, setNewClassDescription] = useState("");

  const [assignClassId, setAssignClassId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");

  const [approveRole, setApproveRole] = useState<Record<number, string>>({});
  const [viewUser, setViewUser] = useState<any | null>(null);
  const [searchRemove, setSearchRemove] = useState("");

  const [parents, setParents] = useState<any[]>([]);
  const [searchRemoveParents, setSearchRemoveParents] = useState("");

  const [guardianRequests, setGuardianRequests] = useState<any[]>([]);
  const [assignGuardianParentId, setAssignGuardianParentId] = useState<Record<number, string>>({});

  const [search, setSearch] = useState({
    class: "",
    teacher: "",
    sp: "",
    pending: ""
  });

  const [sort, setSort] = useState({
    class: "az",
    teacher: "az",
    sp: "az",
    pending: "az"
  });

  const [page, setPage] = useState({
    class: 0,
    teacher: 0,
    sp: 0,
    pending: 0
  });

  const [expandedStudents, setExpandedStudents] = useState<Record<number, boolean>>({});
  const [selectedSection, setSelectedSection] = useState<SectionKey>("dashboard");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [reportClassId, setReportClassId] = useState("");
  const [reportStartDate, setReportStartDate] = useState(oneYearAgoStr());
  const [reportEndDate, setReportEndDate] = useState(todayStr());
  const [reportDownloading, setReportDownloading] = useState(false);

  const [notificationAudience, setNotificationAudience] = useState("");
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [sentNotifications, setSentNotifications] = useState<any[]>([]);
  const [myNotifications, setMyNotifications] = useState<any[]>([]);

  const [terms, setTerms] = useState<Term[]>([]);
  const [newTermName, setNewTermName] = useState("");
  const [newTermStart, setNewTermStart] = useState("");
  const [newTermEnd, setNewTermEnd] = useState("");

  const [reportCardStudent, setReportCardStudent] = useState<any | null>(null);
  const [studentReportCards, setStudentReportCards] = useState<ReportCard[]>([]);
  const [reportCardsLoading, setReportCardsLoading] = useState(false);
  const [editingReportCardId, setEditingReportCardId] = useState<number | null>(null);
  const [reportCardTermId, setReportCardTermId] = useState("");
  const [reportCardSubjects, setReportCardSubjects] = useState<SubjectFormRow[]>([emptySubjectRow()]);

  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [newEvent, setNewEvent] = useState({ title: "", description: "", event_date: "", start_time: "", end_time: "" });

  const [scheduleTerms, setScheduleTerms] = useState<Term[]>([]);
  const [newScheduleTerm, setNewScheduleTerm] = useState({ name: "", start_date: "", end_date: "" });
  const [expandedTermId, setExpandedTermId] = useState<number | null>(null);
  const [expandedTermSlots, setExpandedTermSlots] = useState<CalendarSlot[]>([]);
  const [expandedTermSlotsLoading, setExpandedTermSlotsLoading] = useState(false);

  const [attendanceRange, setAttendanceRange] = useState<"term" | "year">("term");
  const [feesRange, setFeesRange] = useState<"month" | "year">("month");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [bulkUploadFileName, setBulkUploadFileName] = useState("");
  const [bulkUploadRows, setBulkUploadRows] = useState<Record<string, string>[]>([]);
  const [bulkUploadParseError, setBulkUploadParseError] = useState("");
  const [bulkUploadSubmitting, setBulkUploadSubmitting] = useState(false);
  const [bulkUploadResults, setBulkUploadResults] = useState<BulkUploadRowResult[] | null>(null);
  const [bulkUploadSummary, setBulkUploadSummary] = useState<{ total: number; succeeded: number; failed: number } | null>(null);

  const [timetableClassId, setTimetableClassId] = useState("");
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [timetableSlotsLoading, setTimetableSlotsLoading] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [slotForm, setSlotForm] = useState(emptySlotForm());

  const { confirm, ConfirmDialog } = useConfirm();

  const loadAll = async () => {
    try {
      const [
        classRes,
        teacherRes,
        spRes,
        pendingRes,
        assignedRes,
        rolesRes,
        featuresRes,
        parentsRes,
        sentNotificationsRes,
        myNotificationsRes,
        termsRes,
        eventsRes,
        guardianRequestsRes
      ] = await Promise.all([
        api.get("/admin/classes"),
        api.get("/admin/teachers"),
        api.get("/admin/students-parents"),
        api.get("/admin/pending-users"),
        api.get("/admin/assigned-students"),
        api.get("/admin/roles"),
        api.get("/features"),
        api.get("/admin/parents"),
        api.get("/notifications/sent"),
        api.get("/notifications"),
        api.get("/report-cards/terms"),
        api.get("/timetable/events"),
        api.get("/admin/guardian-requests")
      ]);

      setClasses(classRes.data || []);
      setTeachers(teacherRes.data || []);
      setStudentsParents(spRes.data || []);
      setPendingUsers(pendingRes.data || []);
      setAssignedStudents(assignedRes.data || []);
      setSentNotifications(sentNotificationsRes.data || []);
      setMyNotifications(myNotificationsRes.data || []);
      setRoles(
        (rolesRes.data || []).filter(
          (r: RoleItem) => !["pending", "owner", "maintainer", "system_admin"].includes(r.name)
        )
      );
      setFeatures(featuresRes.data?.flags || {});
      setParents(parentsRes.data || []);
      setTerms(termsRes.data.terms || []);
      setEvents(eventsRes.data.events || []);
      setGuardianRequests(guardianRequestsRes.data || []);
      setLoadError(null);
    } catch (err) {
      console.error("Failed to load admin data", err);
      setLoadError(getErrorMessage(err, "Failed to load dashboard data."));
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  usePolling(loadAll, POLL_INTERVAL_MS);

  const loadScheduleTerms = async () => {
    try {
      const res = await api.get("/timetable/terms");
      setScheduleTerms(res.data.terms || []);
    } catch (err) {
      console.error("Load schedule terms error:", err);
      setLoadError(getErrorMessage(err, "Failed to load terms"));
    }
  };

  const createScheduleTerm = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/timetable/terms", newScheduleTerm);
      setNewScheduleTerm({ name: "", start_date: "", end_date: "" });
      const res = await api.get("/timetable/terms");
      setScheduleTerms(res.data.terms || []);
      setSuccessMessage("Term created successfully.");
    } catch (err) {
      console.error("Create schedule term error:", err);
      setLoadError(getErrorMessage(err, "Failed to create term"));
    }
  };

  const toggleTermExpand = async (termId: number) => {
    if (expandedTermId === termId) {
      setExpandedTermId(null);
      setExpandedTermSlots([]);
      return;
    }

    setExpandedTermId(termId);
    setExpandedTermSlots([]);
    setExpandedTermSlotsLoading(true);
    try {
      const res = await api.get("/timetable/slots", { params: { term_id: termId } });
      setExpandedTermSlots(res.data.slots || []);
    } catch (err) {
      console.error("Load term schedule error:", err);
      setLoadError(getErrorMessage(err, "Failed to load this term's schedule"));
    } finally {
      setExpandedTermSlotsLoading(false);
    }
  };

  // Fetched on-demand rather than in loadAll: gated by the timetable flag,
  // and loadAll runs unconditionally on every dashboard load — fetching
  // it there would 403 the whole dashboard for any school that hasn't
  // turned the flag on yet.
  useEffect(() => {
    if (selectedSection === "timetable" && features.timetable) {
      loadScheduleTerms();
    }
  }, [selectedSection, features.timetable]);

  const loadAnalytics = async (range: "term" | "year", feesRangeParam: "month" | "year") => {
    setAnalyticsLoading(true);
    try {
      const res = await api.get("/admin/analytics", { params: { range, feesRange: feesRangeParam } });
      setAnalyticsData(res.data);
    } catch (err) {
      console.error("Load analytics error:", err);
      setLoadError(getErrorMessage(err, "Failed to load analytics"));
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSection === "analytics" && features.analytics_dashboard) {
      loadAnalytics(attendanceRange, feesRange);
    }
  }, [selectedSection, features.analytics_dashboard, attendanceRange, feesRange]);

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
      setLoadError(getErrorMessage(err, "Failed to upload students"));
    } finally {
      setBulkUploadSubmitting(false);
    }
  };

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/admin/classes", {
        class_name: newClassName,
        class_code: newClassCode,
        year_group: newClassYearGroup,
        description: newClassDescription
      });

      setNewClassName("");
      setNewClassCode("");
      setNewClassYearGroup("");
      setNewClassDescription("");
      loadAll();
      setSuccessMessage("Class created successfully.");
    } catch (err) {
      console.error("Create class error:", err);
      setLoadError(getErrorMessage(err, "Failed to create class"));
    }
  };

  const saveClassChanges = async () => {
    if (!editingClass) return;

    try {
      await api.put(`/admin/classes/${editingClass.id}`, {
        class_name: editingClass.class_name,
        class_code: editingClass.class_code,
        year_group: editingClass.year_group,
        description: editingClass.description
      });

      setEditingClass(null);
      loadAll();
      setSuccessMessage("Class updated successfully.");
    } catch (err) {
      console.error("Update class error:", err);
      setLoadError(getErrorMessage(err, "Failed to update class"));
    }
  };

  const handleDeleteClass = async (classId: number) => {
    if (!(await confirm("Are you sure you want to remove this class?"))) return;

    try {
      await api.delete(`/admin/classes/${classId}`);
      loadAll();
      setSuccessMessage("Class deleted successfully.");
    } catch (err) {
      console.error("Delete class error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete class"));
    }
  };

  const assignStudentToClass = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!assignStudentClassId || !assignStudentId) {
      setLoadError("Please select both a class and a student.");
      return;
    }

    try {
      await api.post(`/admin/classes/${assignStudentClassId}/assign-student`, {
        studentId: Number(assignStudentId)
      });

      setAssignStudentClassId("");
      setAssignStudentId("");
      loadAll();
      setSuccessMessage("Student assigned to class successfully.");
    } catch (err) {
      console.error("Assign student error:", err);
      setLoadError(getErrorMessage(err, "Failed to assign student"));
    }
  };

  const removeStudentFromClass = async (classId: number, studentId: number) => {
    if (!(await confirm("Remove this student from the class?"))) return;

    try {
      await api.post(`/admin/classes/${classId}/remove-student`, {
        studentId
      });

      loadAll();
      setSuccessMessage("Student removed from class successfully.");
    } catch (err) {
      console.error("Remove student error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove student"));
    }
  };

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
      const res = await api.get("/report-cards/terms");
      setTerms(res.data.terms || []);
      setSuccessMessage("Term created successfully.");
    } catch (err) {
      console.error("Create term error:", err);
      setLoadError(getErrorMessage(err, "Failed to create term"));
    }
  };

  const resetReportCardForm = () => {
    setEditingReportCardId(null);
    setReportCardTermId("");
    setReportCardSubjects([emptySubjectRow()]);
  };

  const openReportCardModal = async (student: any) => {
    setReportCardStudent(student);
    setStudentReportCards([]);
    resetReportCardForm();
    setReportCardsLoading(true);

    try {
      const res = await api.get(`/report-cards/students/${student.student_id}`);
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
        await api.post(`/report-cards/students/${reportCardStudent.student_id}`, {
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

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/timetable/events", {
        title: newEvent.title,
        description: newEvent.description || undefined,
        event_date: newEvent.event_date,
        start_time: newEvent.start_time || undefined,
        end_time: newEvent.end_time || undefined
      });

      setNewEvent({ title: "", description: "", event_date: "", start_time: "", end_time: "" });
      const res = await api.get("/timetable/events");
      setEvents(res.data.events || []);
      setSuccessMessage("Event created successfully.");
    } catch (err) {
      console.error("Create event error:", err);
      setLoadError(getErrorMessage(err, "Failed to create event"));
    }
  };

  const deleteEvent = async (id: number) => {
    if (!(await confirm("Are you sure you want to delete this event?"))) return;

    try {
      await api.delete(`/timetable/events/${id}`);
      setEvents(prev => prev.filter(e => e.id !== id));
      setSuccessMessage("Event deleted successfully.");
    } catch (err) {
      console.error("Delete event error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete event"));
    }
  };

  const loadTimetableSlots = async (classId: string) => {
    setTimetableClassId(classId);
    setTimetableSlots([]);
    setEditingSlotId(null);
    setSlotForm(emptySlotForm());
    if (!classId) return;

    setTimetableSlotsLoading(true);
    try {
      const res = await api.get(`/timetable/classes/${classId}/slots`);
      setTimetableSlots(res.data.slots || []);
    } catch (err) {
      console.error("Load timetable slots error:", err);
      setLoadError(getErrorMessage(err, "Failed to load timetable"));
    } finally {
      setTimetableSlotsLoading(false);
    }
  };

  const startEditSlot = (slot: TimetableSlot) => {
    setEditingSlotId(slot.id);
    setSlotForm({
      slot_date: slot.slot_date.slice(0, 10),
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
      subject_name: slot.subject_name || "",
      teacher_id: slot.teacher_id ? String(slot.teacher_id) : ""
    });
  };

  const cancelEditSlot = () => {
    setEditingSlotId(null);
    setSlotForm(emptySlotForm());
  };

  const submitSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timetableClassId) return;

    const body = {
      slot_date: slotForm.slot_date,
      start_time: slotForm.start_time,
      end_time: slotForm.end_time,
      subject_name: slotForm.subject_name.trim() || undefined,
      teacher_id: slotForm.teacher_id ? Number(slotForm.teacher_id) : undefined
    };

    try {
      if (editingSlotId) {
        await api.put(`/timetable/slots/${editingSlotId}`, body);
        setSuccessMessage("Timetable slot updated.");
      } else {
        await api.post(`/timetable/classes/${timetableClassId}/slots`, body);
        setSuccessMessage("Timetable slot created.");
      }
      const res = await api.get(`/timetable/classes/${timetableClassId}/slots`);
      setTimetableSlots(res.data.slots || []);
      cancelEditSlot();
    } catch (err) {
      console.error("Save timetable slot error:", err);
      setLoadError(getErrorMessage(err, "Failed to save timetable slot"));
    }
  };

  const deleteSlot = async (id: number) => {
    if (!(await confirm("Are you sure you want to delete this timetable slot?"))) return;

    try {
      await api.delete(`/timetable/slots/${id}`);
      setTimetableSlots(prev => prev.filter(s => s.id !== id));
      setSuccessMessage("Timetable slot deleted.");
      if (editingSlotId === id) cancelEditSlot();
    } catch (err) {
      console.error("Delete timetable slot error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete timetable slot"));
    }
  };

  const assignTeacher = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!assignClassId || !assignTeacherId) {
      setLoadError("Please select both a class and a teacher.");
      return;
    }

    try {
      await api.post(`/admin/classes/${assignClassId}/assign-teacher`, {
        teacherUserId: Number(assignTeacherId)
      });

      loadAll();
      setAssignClassId("");
      setAssignTeacherId("");
      setSuccessMessage("Teacher assigned to class successfully.");
    } catch (err) {
      console.error("Assign teacher error:", err);
      setLoadError(getErrorMessage(err, "Failed to assign teacher"));
    }
  };

  const handleRemoveTeacher = async (classId: number, teacherId: number) => {
    if (!(await confirm("Remove this teacher from the class?"))) return;

    try {
      await api.post(`/admin/classes/${classId}/remove-teacher`, {
        teacherUserId: teacherId
      });

      loadAll();
      setSuccessMessage("Teacher removed from class successfully.");
    } catch (err) {
      console.error("Remove teacher error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove teacher"));
    }
  };

  const handleDeleteTeacher = async (teacherId: number) => {
    if (!(await confirm("Remove this teacher?"))) return;

    try {
      await api.delete(`/admin/teachers/${teacherId}`);
      loadAll();
      setSuccessMessage("Teacher removed successfully.");
    } catch (err) {
      console.error("Delete teacher error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete teacher"));
    }
  };

  const approveUser = async (userId: number) => {
    const role = approveRole[userId];
    if (!role) {
      setLoadError("Please select a role before approving.");
      return;
    }

    try {
      const res = await api.post(`/admin/approve/${userId}`, { role });
      loadAll();
      const studentAccounts = res.data.studentAccounts || [];
      if (studentAccounts.length > 0) {
        const creds = studentAccounts
          .map((s: any) => `${s.name} — username: ${s.username}, one-time password: ${s.temporaryPassword}`)
          .join("; ");
        setSuccessMessage(`User approved successfully. Student login(s) created: ${creds} — share these directly, they won't be shown again.`);
      } else {
        setSuccessMessage("User approved successfully.");
      }
    } catch (err) {
      console.error("Approve user error:", err);
      setLoadError(getErrorMessage(err, "Failed to approve user"));
    }
  };

  const rejectUser = async (userId: number) => {
    if (!(await confirm("Reject this user?"))) return;

    try {
      await api.post(`/admin/reject/${userId}`);
      loadAll();
      setSuccessMessage("User rejected successfully.");
    } catch (err) {
      console.error("Reject user error:", err);
      setLoadError(getErrorMessage(err, "Failed to reject user"));
    }
  };

  const handleRemoveStudent = async (studentId: number) => {
    if (!(await confirm("Remove this student permanently?"))) return;

    try {
      await api.delete(`/admin/remove-student/${studentId}`);
      loadAll();
      setSuccessMessage("Student removed successfully.");
    } catch (err) {
      console.error("Remove student error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove student"));
    }
  };

  const handleRemoveParent = async (parentId: number) => {
    if (!(await confirm("Remove this parent permanently?"))) return;

    try {
      await api.delete(`/admin/remove-parent/${parentId}`);
      loadAll();
      setSuccessMessage("Parent removed successfully.");
    } catch (err) {
      console.error("Remove parent error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove parent"));
    }
  };

  const handleResetPassword = async (userId: number, label: string) => {
    if (!(await confirm(`Reset ${label}'s password? A new one-time password will be generated.`))) return;

    try {
      const res = await api.post(`/admin/users/${userId}/reset-password`);
      setSuccessMessage(
        `Password reset for ${label}. One-time password: ${res.data.temporaryPassword} — share this with them directly, it won't be shown again.`
      );
    } catch (err) {
      console.error("Reset password error:", err);
      setLoadError(getErrorMessage(err, "Failed to reset password"));
    }
  };

  const handleGenerateStudentLogin = async (studentId: number, label: string) => {
    if (!(await confirm(`Generate a login for ${label}? A one-time password will be created.`))) return;

    try {
      const res = await api.post(`/admin/students/${studentId}/generate-login`);
      setSuccessMessage(
        `Login created for ${label}. Username: ${res.data.username}. One-time password: ${res.data.temporaryPassword} — share this with them directly, it won't be shown again.`
      );
      await loadAll();
    } catch (err) {
      console.error("Generate student login error:", err);
      setLoadError(getErrorMessage(err, "Failed to generate login"));
    }
  };

  const assignGuardian = async (studentId: number) => {
    const parentId = assignGuardianParentId[studentId];
    if (!parentId) return;

    try {
      await api.post(`/admin/students/${studentId}/assign-guardian`, { parent_id: Number(parentId) });
      setAssignGuardianParentId(prev => ({ ...prev, [studentId]: "" }));
      await loadAll();
      setSuccessMessage("Guardian assigned.");
    } catch (err) {
      console.error("Assign guardian error:", err);
      setLoadError(getErrorMessage(err, "Failed to assign guardian"));
    }
  };

  const removeGuardian = async (studentId: number, parentId: number) => {
    if (!(await confirm("Remove this guardian from the student?"))) return;

    try {
      await api.post(`/admin/students/${studentId}/remove-guardian`, { parent_id: parentId });
      await loadAll();
      setSuccessMessage("Guardian removed.");
    } catch (err) {
      console.error("Remove guardian error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove guardian"));
    }
  };

  const approveGuardianRequest = async (studentId: number, parentId: number) => {
    try {
      await api.post("/admin/guardian-requests/approve", { student_id: studentId, parent_id: parentId });
      await loadAll();
      setSuccessMessage("Guardian request approved.");
    } catch (err) {
      console.error("Approve guardian request error:", err);
      setLoadError(getErrorMessage(err, "Failed to approve guardian request"));
    }
  };

  const rejectGuardianRequest = async (studentId: number, parentId: number) => {
    if (!(await confirm("Reject this guardian link request?"))) return;

    try {
      await api.post("/admin/guardian-requests/reject", { student_id: studentId, parent_id: parentId });
      await loadAll();
      setSuccessMessage("Guardian request rejected.");
    } catch (err) {
      console.error("Reject guardian request error:", err);
      setLoadError(getErrorMessage(err, "Failed to reject guardian request"));
    }
  };

  const downloadAttendanceReport = async () => {
    if (reportStartDate > reportEndDate) {
      setLoadError("Start date must be before end date.");
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
      setSuccessMessage("Attendance report downloaded.");
    } else {
      setLoadError(result.message);
    }
  };

  const sendNotification = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!notificationAudience) {
      setLoadError("Please choose who this notification is for.");
      return;
    }

    try {
      const res = await api.post("/notifications", {
        audience: notificationAudience,
        title: notificationTitle,
        message: notificationMessage
      });

      setNotificationAudience("");
      setNotificationTitle("");
      setNotificationMessage("");
      loadAll();
      setSuccessMessage(`Notification sent to ${res.data.recipientCount} recipient(s).`);
    } catch (err) {
      console.error("Send notification error:", err);
      setLoadError(getErrorMessage(err, "Failed to send notification"));
    }
  };

  const markNotificationRead = async (id: number) => {
    setMyNotifications(prev =>
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
  if (features.timetable) {
    navItems = [...navItems, { key: "timetable", icon: "🗓️", label: "Timetable" }];
  }
  if (features.analytics_dashboard) {
    navItems = [...navItems, { key: "analytics", icon: "📈", label: "Analytics" }];
  }
  if (features.fees) {
    navItems = [...navItems, { key: "fees", icon: "💰", label: "Fee Tracking" }];
  }
  if (features.password_management) {
    navItems = [...navItems, { key: "passwordManagement", icon: "🔑", label: "Password Management" }];
  }

  return (
    <BaseDashboard
      navItems={navItems}
      selectedSection={selectedSection}
      onSelectSection={key => setSelectedSection(key as SectionKey)}
      title={SECTION_TITLES[selectedSection]}
      error={loadError}
      onDismissError={() => setLoadError(null)}
      success={successMessage}
      onDismissSuccess={() => setSuccessMessage(null)}
    >
      {ConfirmDialog}

      {/* ---------------------- DASHBOARD SECTION ---------------------- */}
      {selectedSection === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Welcome Card */}
          <div style={styles.card}>
            <h3 style={{ marginBottom: 12 }}>Welcome to your Admin Dashboard</h3>

            <p style={styles.text}>
              This is your central control panel for managing the entire school system.
              From here, you can oversee classes, teachers, students, parents, approvals,
              and system‑wide operations. Use the sidebar to navigate between modules.
            </p>

            <p style={styles.text}>
              Your dashboard gives you quick access to essential tools and insights,
              helping you keep the school running smoothly and efficiently.
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
            {/* Classes Overview */}
            <div
              style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("class")}
            >
              <h4 style={{ marginBottom: 8 }}>Manage Classes</h4>
              <p style={styles.text}>
                Create, update, and organize school classes. Assign teachers and manage
                student enrollment.
              </p>
            </div>

            {/* Teachers Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("teacher")}
            >
              <h4 style={{ marginBottom: 8 }}>Teachers</h4>
              <p style={styles.text}>
                View and manage teacher accounts, roles, and assigned classes.
              </p>
            </div>

            {/* Students & Parents Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("sp")}
            >
              <h4 style={{ marginBottom: 8 }}>Students & Parents</h4>
              <p style={styles.text}>
                Access student and parent information, linked accounts, and school records.
              </p>
            </div>

            {/* Approvals Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("approvals")}
            >
              <h4 style={{ marginBottom: 8 }}>Pending Approvals</h4>
              <p style={styles.text}>
                Review and approve new registrations, role changes, and account requests.
              </p>
            </div>

            {/* Attendance Report Overview */}
            {features.attendance_report && (
              <div
                style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
                onClick={() => setSelectedSection("report")}
              >
                <h4 style={{ marginBottom: 8 }}>Attendance Report</h4>
                <p style={styles.text}>
                  Download a CSV of class attendance, filtered by class and date range.
                </p>
              </div>
            )}

            {/* remove user Overview */}
            <div style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
              onClick={() => setSelectedSection("remove")}
            >
              <h4 style={{ marginBottom: 8 }}>Remove User</h4>
              <p style={styles.text}>
                Remove users account.
              </p>
            </div>

            {/* Notifications Overview */}
            {features.notifications && (
              <div
                style={{ ...styles.card, flex: "1 1 280px", cursor: "pointer" }}
                onClick={() => setSelectedSection("notifications")}
              >
                <h4 style={{ marginBottom: 8 }}>Notifications</h4>
                <p style={styles.text}>
                  Send a notification to parents or staff, and view what's been sent.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CLASS MANAGEMENT */}
      {selectedSection === "class" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
                  Your school code is added automatically as a prefix (e.g. "7A" becomes "SCHOOLCODE-7A").
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

            <SearchSort
              search={search.class}
              onSearch={v => setSearch({ ...search, class: v })}
              sort={sort.class}
              onSort={v => setSort({ ...sort, class: v })}
            />

            <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Class Name</th>
                  <th style={{ textAlign: "left" }}>Class Code</th>
                  <th style={{ textAlign: "left" }}>Year Group</th>
                  <th style={{ textAlign: "left" }}>Description</th>
                  <th style={{ textAlign: "center", width: 120 }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginate(
                  sortData(
                    classes.filter((c: any) =>
                      (
                        `${c?.class_name || ""} ${c?.year_group || ""} ${c?.class_code || ""}`
                      )
                        .toLowerCase()
                        .includes(search.class.toLowerCase())
                    ),
                    "class_name",
                    sort.class
                  ),
                  page.class,
                  PAGE_SIZE
                ).map((c: any) => (
                  <tr key={c.id}>
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

            <Pagination
              page={page.class}
              setPage={n => setPage({ ...page, class: n })}
              pageSize={PAGE_SIZE}
              total={
                classes.filter((c: any) =>
                  (
                    `${c?.class_name || ""} ${c?.year_group || ""} ${c?.class_code || ""}`
                  )
                    .toLowerCase()
                    .includes(search.class.toLowerCase())
                ).length
              }
            />
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
                {classes.map((c: any) => (
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
                                value={editingClass.class_name}
                                onChange={e =>
                                  setEditingClass({
                                    ...editingClass,
                                    class_name: e.target.value
                                  })
                                }
                                style={styles.input}
                              />

                              <label style={{ fontWeight: 600 }}>Class Code</label>
                              <input
                                value={editingClass.class_code || ""}
                                onChange={e =>
                                  setEditingClass({
                                    ...editingClass,
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
                                value={editingClass.year_group || ""}
                                onChange={e =>
                                  setEditingClass({
                                    ...editingClass,
                                    year_group: e.target.value
                                  })
                                }
                                style={styles.input}
                              />

                              <label style={{ fontWeight: 600 }}>Description</label>
                              <textarea
                                value={editingClass.description || ""}
                                onChange={e =>
                                  setEditingClass({
                                    ...editingClass,
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
                  {classes.map((c: any) => (
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
                  {studentsParents.map((s: any) => (
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
      )}

      {/* TEACHER MANAGEMENT */}
      {selectedSection === "teacher" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Assign Teacher to Class</h3>

            <form
              onSubmit={assignTeacher}
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
                  value={assignClassId}
                  onChange={e => setAssignClassId(e.target.value)}
                  style={styles.input}
                >
                  <option value="">Choose a class</option>
                  {classes.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.class_name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>
                  Select Teacher
                </label>
                <select
                  value={assignTeacherId}
                  onChange={e => setAssignTeacherId(e.target.value)}
                  style={styles.input}
                >
                  <option value="">Choose a teacher</option>
                  {teachers.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.username}
                    </option>
                  ))}
                </select>
              </div>

              <button style={{ ...styles.actionBtn, marginTop: 8 }}>
                Assign Teacher
              </button>
            </form>
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Teacher Directory</h3>

            <SearchSort
              search={search.teacher}
              onSearch={v => setSearch({ ...search, teacher: v })}
              sort={sort.teacher}
              onSort={v => setSort({ ...sort, teacher: v })}
            />

            <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Teacher</th>
                  <th style={{ textAlign: "left" }}>Email</th>
                  <th style={{ textAlign: "left" }}>Assigned Class</th>
                  <th style={{ textAlign: "center", width: 120 }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginate(
                  sortData(
                    teachers.filter((t: any) =>
                      ((t?.username as string) || "")
                        .toLowerCase()
                        .includes(search.teacher.toLowerCase())
                    ),
                    "username",
                    sort.teacher
                  ),
                  page.teacher,
                  PAGE_SIZE
                ).map((t: any) => {
                  const assigned = t.assigned_classes || [];

                  if (assigned.length === 0) {
                    return (
                      <tr key={t.id}>
                        <td>{t.username}</td>
                        <td>{t.email || "—"}</td>
                        <td>—</td>

                        <td style={{ textAlign: "center" }}>
                          <button
                            onClick={() => handleDeleteTeacher(t.id)}
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
                    );
                  }

                  return assigned.map((cls: any) => (
                    <tr key={`${t.id}-${cls.id}`}>
                      <td>{t.username}</td>
                      <td>{t.email || "—"}</td>
                      <td>{cls.class_name}</td>

                      <td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => handleRemoveTeacher(cls.id, t.id)}
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
                  ));
                })}
              </tbody>
            </table>
            </div>

            <Pagination
              page={page.teacher}
              setPage={n => setPage({ ...page, teacher: n })}
              pageSize={PAGE_SIZE}
              total={
                teachers.filter((t: any) =>
                  ((t?.username as string) || "")
                    .toLowerCase()
                    .includes(search.teacher.toLowerCase())
                ).length
              }
            />
          </div>
        </div>
      )}

      {/* STUDENT & PARENT OVERVIEW */}
      {selectedSection === "sp" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Student & Parent Overview</h3>

            <SearchSort
              search={search.sp}
              onSearch={v => setSearch({ ...search, sp: v })}
              sort={sort.sp}
              onSort={v => setSort({ ...sort, sp: v })}
            />

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
                {paginate(
                  sortData(
                    studentsParents.filter((row: any) =>
                      (
                        `${row?.student_first_name || ""} ${
                          row?.student_last_name || ""
                        }`
                      )
                        .toLowerCase()
                        .includes(search.sp.toLowerCase())
                    ),
                    "student_first_name",
                    sort.sp
                  ),
                  page.sp,
                  PAGE_SIZE
                ).map((row: any) => {
                  const studentId = row.student_id;
                  const isExpanded = !!expandedStudents[studentId];

                  const studentAddress = [
                    row.student_address1,
                    row.student_address2,
                    row.student_address3
                  ]
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

                        <td>{formatDate(row.student_date_of_birth)}</td>

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
                                <h4
                                  style={{
                                    fontSize: 18,
                                    marginBottom: 10,
                                    color: "#4c1d95"
                                  }}
                                >
                                  Student Details
                                </h4>

                                <div>
                                  <strong>Gender:</strong>{" "}
                                  {row.student_gender || "—"}
                                </div>
                                <div>
                                  <strong>Address:</strong>{" "}
                                  {studentAddress || "—"}
                                </div>
                                <div>
                                  <strong>City:</strong>{" "}
                                  {row.student_city || "—"}
                                </div>
                                <div>
                                  <strong>Postcode:</strong>{" "}
                                  {row.student_postcode || "—"}
                                </div>
                                <div>
                                  <strong>Medical Condition:</strong>{" "}
                                  {row.student_medical_condition || "—"}
                                </div>
                              </div>

                              <hr style={{ margin: "20px 0" }} />

                              <div>
                                <h4
                                  style={{
                                    fontSize: 18,
                                    marginBottom: 10,
                                    color: "#4c1d95"
                                  }}
                                >
                                  Guardian Code
                                </h4>
                                <div>{row.student_guardian_code || "—"}</div>
                              </div>

                              {features.password_management && (
                                <>
                                  <hr style={{ margin: "20px 0" }} />
                                  <div>
                                    <h4
                                      style={{
                                        fontSize: 18,
                                        marginBottom: 10,
                                        color: "#4c1d95"
                                      }}
                                    >
                                      Login
                                    </h4>
                                    {row.student_user_id ? (
                                      <button
                                        style={styles.secondaryBtn}
                                        onClick={() =>
                                          handleResetPassword(row.student_user_id, `${row.student_first_name} ${row.student_last_name}`)
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

                              {(row.guardians || []).map((g: any, gIdx: number) => (
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
                                <h4 style={{ fontSize: 16, marginBottom: 8, color: "#4c1d95" }}>
                                  Assign Another Guardian
                                </h4>
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
                                      .filter((p: any) => p.parent_school_id === row.student_school_id)
                                      .filter((p: any) => !(row.guardians || []).some((g: any) => g.parent_id === p.parent_id))
                                      .map((p: any) => (
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

            <Pagination
              page={page.sp}
              setPage={n => setPage({ ...page, sp: n })}
              pageSize={PAGE_SIZE}
              total={
                studentsParents.filter((row: any) =>
                  (
                    `${row?.student_first_name || ""} ${
                      row?.student_last_name || ""
                    }`
                  )
                    .toLowerCase()
                    .includes(search.sp.toLowerCase())
                ).length
              }
            />
          </div>
        </div>
      )}

      {/* APPROVALS */}
      {selectedSection === "approvals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Pending User Approvals</h3>

            <SearchSort
              search={search.pending}
              onSearch={v => setSearch({ ...search, pending: v })}
              sort={sort.pending}
              onSort={v => setSort({ ...sort, pending: v })}
            />

            <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Username</th>
                  <th style={{ textAlign: "left" }}>First Name</th>
                  <th style={{ textAlign: "left" }}>Surname</th>
                  <th style={{ textAlign: "left" }}>Contact Number</th>
                  <th style={{ textAlign: "left" }}>Email</th>
                  <th style={{ textAlign: "center" }}>Requested Role</th>
                  <th style={{ textAlign: "center", width: 140 }}>Select Role</th>
                  <th style={{ textAlign: "center", width: 200 }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginate(
                  sortData(
                    pendingUsers.filter((u: any) =>
                      ((u?.username as string) || "")
                        .toLowerCase()
                        .includes(search.pending.toLowerCase())
                    ),
                    "username",
                    sort.pending
                  ),
                  page.pending,
                  PAGE_SIZE
                ).map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.username}</strong>
                    </td>
                    <td>{u.first_name || "—"}</td>
                    <td>{u.last_name || "—"}</td>
                    <td>{u.contact_number || "—"}</td>
                    <td>{u.email || "—"}</td>

                    <td style={{ textAlign: "center" }}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 8,
                          background: "#e0e7ff",
                          color: "#3730a3",
                          fontWeight: 600,
                          fontSize: 13
                        }}
                      >
                        {u.requested_role || "—"}
                      </span>
                    </td>

                    <td style={{ textAlign: "center" }}>
                      <select
                        value={approveRole[u.id] || ""}
                        onChange={e =>
                          setApproveRole(prev => ({
                            ...prev,
                            [u.id]: e.target.value
                          }))
                        }
                        style={{
                          ...styles.input,
                          width: "100%",
                          maxWidth: 160
                        }}
                      >
                        <option value="">Select role</option>
                        {roles.map(r => (
                          <option key={r.id} value={r.name}>
                            {r.name.charAt(0).toUpperCase() + r.name.slice(1)}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td
                      style={{
                        textAlign: "center",
                        display: "flex",
                        gap: 8,
                        justifyContent: "center"
                      }}
                    >
                      <button
                        onClick={() => setViewUser(u)}
                        style={{
                          background: "#3b82f6",
                          color: "white",
                          border: "none",
                          padding: "6px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 13
                        }}
                      >
                        View
                      </button>

                      <button
                        onClick={() => approveUser(u.id)}
                        style={{
                          background: "#16a34a",
                          color: "white",
                          border: "none",
                          padding: "6px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 13
                        }}
                      >
                        Approve
                      </button>

                      <button
                        onClick={() => rejectUser(u.id)}
                        style={{
                          background: "#dc2626",
                          color: "white",
                          border: "none",
                          padding: "6px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 13
                        }}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <Pagination
              page={page.pending}
              setPage={n => setPage({ ...page, pending: n })}
              pageSize={PAGE_SIZE}
              total={
                pendingUsers.filter((u: any) =>
                  ((u?.username as string) || "")
                    .toLowerCase()
                    .includes(search.pending.toLowerCase())
                ).length
              }
            />
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Guardian Requests</h3>
            <p style={{ ...styles.text, fontSize: 13, color: "#64748b" }}>
              Self-service requests from an already-approved parent asking to link as an additional
              guardian on a child that isn't theirs yet.
            </p>

            {guardianRequests.length === 0 ? (
              <p style={styles.text}>No pending guardian requests.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...styles.table, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Student</th>
                      <th style={{ textAlign: "left" }}>Requesting Parent</th>
                      <th style={{ textAlign: "left" }}>Email</th>
                      <th style={{ textAlign: "center", width: 180 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardianRequests.map((r: any) => (
                      <tr key={`${r.student_id}-${r.parent_id}`}>
                        <td>
                          {r.student_first_name} {r.student_last_name}
                        </td>
                        <td>
                          {r.parent_first_name} {r.parent_last_name}
                        </td>
                        <td>{r.parent_email}</td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            style={{ ...styles.secondaryBtn, marginRight: 6 }}
                            onClick={() => approveGuardianRequest(r.student_id, r.parent_id)}
                          >
                            Approve
                          </button>
                          <button
                            style={{ ...styles.secondaryBtn, background: "#dc2626", color: "#fff" }}
                            onClick={() => rejectGuardianRequest(r.student_id, r.parent_id)}
                          >
                            Reject
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

      {viewUser && (
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
            zIndex: 9999
          }}
        >
          <div
            style={{
              background: "white",
              padding: 24,
              borderRadius: 12,
              width: "90%",
              maxWidth: 450,
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
            }}
          >
            <h3 style={{ marginBottom: 16 }}>User Details</h3>

            <div>
              <strong>Username:</strong> {viewUser.username}
            </div>
            <div>
              <strong>First Name:</strong> {viewUser.first_name}
            </div>
            <div>
              <strong>Surname:</strong> {viewUser.last_name}
            </div>
            <div>
              <strong>Email:</strong> {viewUser.email}
            </div>
            <div>
              <strong>Contact Number:</strong> {viewUser.contact_number}
            </div>
            <div>
              <strong>Requested Role:</strong> {viewUser.requested_role}
            </div>

            <button
              onClick={() => setViewUser(null)}
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

      {/* REMOVE USERS */}
      {selectedSection === "remove" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Remove Students</h3>

            <SearchSort
              search={searchRemove}
              onSearch={v => setSearchRemove(v)}
              sort={sort.sp}
              onSort={v => setSort({ ...sort, sp: v })}
            />

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
                {studentsParents
                  .filter((row: any) => {
                    const guardianNames = (row.guardians || [])
                      .map((g: any) => `${g.first_name} ${g.surname}`)
                      .join(" ");
                    return `${row.student_first_name} ${row.student_last_name} ${guardianNames}`
                      .toLowerCase()
                      .includes(searchRemove.toLowerCase());
                  })
                  .map((row: any) => (
                    <tr key={row.student_id}>
                      <td>
                        <strong>
                          {row.student_first_name} {row.student_last_name}
                        </strong>
                      </td>

                      <td>
                        {(row.guardians || []).map((g: any) => `${g.first_name} ${g.surname}`).join(", ") || "—"}
                      </td>

                      <td>
                        {(row.guardians || []).map((g: any) => g.contact_number).filter(Boolean).join(", ") || "—"}
                      </td>

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
              onSearch={v => setSearchRemoveParents(v)}
              sort={sort.sp}
              onSort={v => setSort({ ...sort, sp: v })}
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
                {parents
                  .filter((p: any) =>
                    `${p.parent_first_name} ${p.parent_last_name}`
                      .toLowerCase()
                      .includes(searchRemoveParents.toLowerCase())
                  )
                  .map((p: any) => (
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
                          disabled={p.student_count > 0}
                          title={
                            p.student_count > 0
                              ? "Remove this parent's students first"
                              : undefined
                          }
                          style={{
                            background: p.student_count > 0 ? "#fca5a5" : "#b91c1c",
                            color: "white",
                            border: "none",
                            padding: "6px 8px",
                            borderRadius: 6,
                            cursor: p.student_count > 0 ? "not-allowed" : "pointer",
                            fontSize: 14
                          }}
                        >
                          Remove Parent
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------- ATTENDANCE REPORT ---------------------- */}
      {selectedSection === "report" && features.attendance_report && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
                  {classes.map((c: any) => (
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
      )}

      {/* ---------------------- NOTIFICATIONS ---------------------- */}
      {selectedSection === "notifications" && features.notifications && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Send Notification</h3>

            <form
              onSubmit={sendNotification}
              style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Send To</label>
                <select
                  value={notificationAudience}
                  onChange={e => setNotificationAudience(e.target.value)}
                  required
                  style={styles.input}
                >
                  <option value="">Choose an audience</option>
                  <option value="parent">Parents only</option>
                  <option value="staff">Staff only</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Title</label>
                <input
                  placeholder="Enter a title"
                  value={notificationTitle}
                  onChange={e => setNotificationTitle(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600, color: "#334155" }}>Message</label>
                <textarea
                  placeholder="Enter the notification message"
                  value={notificationMessage}
                  onChange={e => setNotificationMessage(e.target.value)}
                  required
                  rows={4}
                  style={{ ...styles.input, resize: "vertical", paddingTop: 10 }}
                />
              </div>

              <button style={{ ...styles.actionBtn, marginTop: 8 }}>
                Send Notification
              </button>
            </form>
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Sent Notifications</h3>

            {sentNotifications.length === 0 ? (
              <p style={styles.text}>No notifications have been sent yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...styles.table, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Sent</th>
                      <th style={{ textAlign: "left" }}>Audience</th>
                      <th style={{ textAlign: "left" }}>Title</th>
                      <th style={{ textAlign: "left" }}>Message</th>
                      <th style={{ textAlign: "center" }}>Recipients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentNotifications.map((n: any) => (
                      <tr key={n.id}>
                        <td>{formatDate(n.created_at)}</td>
                        <td>{n.audience === "parent" ? "Parents" : "Staff"}</td>
                        <td>{n.title}</td>
                        <td>{n.message}</td>
                        <td style={{ textAlign: "center" }}>{n.recipient_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Your Notifications</h3>

            {myNotifications.length === 0 ? (
              <p style={styles.text}>You have no notifications yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {myNotifications.map((n: any) => {
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
        </div>
      )}

      {/* ---------------------- REPORT CARDS SECTION ---------------------- */}
      {selectedSection === "reportCards" && features.report_cards && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Report Card Terms</h3>
            <p style={{ ...styles.text, fontSize: 13, color: "#64748b" }}>
              Create the terms teachers pick from when writing a student's report card, then use "Report Card" below to manage one for a specific student.
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

            <SearchSort
              search={search.sp}
              onSearch={v => setSearch({ ...search, sp: v })}
              sort={sort.sp}
              onSort={v => setSort({ ...sort, sp: v })}
            />

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
                  {paginate(
                    sortData(
                      studentsParents.filter((row: any) =>
                        `${row?.student_first_name || ""} ${row?.student_last_name || ""}`
                          .toLowerCase()
                          .includes(search.sp.toLowerCase())
                      ),
                      "student_first_name",
                      sort.sp
                    ),
                    page.sp,
                    PAGE_SIZE
                  ).map((row: any) => (
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

            <Pagination
              page={page.sp}
              setPage={n => setPage({ ...page, sp: n })}
              pageSize={PAGE_SIZE}
              total={
                studentsParents.filter((row: any) =>
                  `${row?.student_first_name || ""} ${row?.student_last_name || ""}`
                    .toLowerCase()
                    .includes(search.sp.toLowerCase())
                ).length
              }
            />
          </div>
        </div>
      )}

      {/* ---------------------- TIMETABLE SECTION ---------------------- */}
      {selectedSection === "timetable" && features.timetable && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Terms</h3>
            <p style={{ ...styles.text, fontSize: 13, color: "#64748b" }}>
              Every schedule lives inside a term. Create the terms that make up the school year, then expand one to see what's scheduled when.
            </p>

            {scheduleTerms.length === 0 ? (
              <p style={styles.text}>No terms yet — add one below.</p>
            ) : (
              <div style={{ overflowX: "auto", marginBottom: 16 }}>
                <table style={{ ...styles.table, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Term</th>
                      <th style={{ textAlign: "left" }}>Dates</th>
                      <th style={{ textAlign: "center", width: 140 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleTerms.map(t => {
                      const today = todayStr();
                      const isCurrent = t.start_date.slice(0, 10) <= today && today <= t.end_date.slice(0, 10);
                      const isExpanded = expandedTermId === t.id;
                      return (
                        <React.Fragment key={t.id}>
                          <tr style={isCurrent ? { background: "#eef2ff" } : undefined}>
                            <td>
                              <strong>{t.name}</strong>
                              {isCurrent && <span style={{ marginLeft: 6, fontSize: 12, color: "#4338ca" }}>Current</span>}
                            </td>
                            <td>
                              {formatDate(t.start_date)} – {formatDate(t.end_date)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button style={styles.secondaryBtn} onClick={() => toggleTermExpand(t.id)}>
                                {isExpanded ? "▼ Hide" : "▶ View Schedule"}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={3} style={{ padding: 0 }}>
                                <div style={{ padding: "12px 16px", background: "#f8fafc" }}>
                                  {expandedTermSlotsLoading ? (
                                    <p style={styles.text}>Loading schedule...</p>
                                  ) : expandedTermSlots.length === 0 ? (
                                    <p style={styles.text}>No classes scheduled in this term yet.</p>
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
                                          {[...expandedTermSlots]
                                            .sort((a, b) => a.slot_date.localeCompare(b.slot_date) || a.start_time.localeCompare(b.start_time))
                                            .map(s => (
                                              <tr key={s.id}>
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
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <form onSubmit={createScheduleTerm} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Name</label>
                <input
                  value={newScheduleTerm.name}
                  onChange={e => setNewScheduleTerm(prev => ({ ...prev, name: e.target.value }))}
                  style={styles.input}
                  placeholder="e.g. Term 1 2025-26"
                  required
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Start Date</label>
                <input
                  type="date"
                  value={newScheduleTerm.start_date}
                  onChange={e => setNewScheduleTerm(prev => ({ ...prev, start_date: e.target.value }))}
                  style={styles.input}
                  required
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>End Date</label>
                <input
                  type="date"
                  value={newScheduleTerm.end_date}
                  onChange={e => setNewScheduleTerm(prev => ({ ...prev, end_date: e.target.value }))}
                  style={styles.input}
                  required
                />
              </div>
              <button style={{ ...styles.actionBtn, marginTop: 0 }}>Add Term</button>
            </form>
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Events</h3>

            {events.length === 0 ? (
              <p style={styles.text}>No events yet.</p>
            ) : (
              <ul style={{ ...styles.list, marginBottom: 16 }}>
                {events.map(ev => (
                  <li key={ev.id} style={{ ...styles.listItem, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div>
                      <strong>{ev.title}</strong> — {formatDate(ev.event_date)}
                      {ev.start_time && ` · ${ev.start_time.slice(0, 5)}${ev.end_time ? `–${ev.end_time.slice(0, 5)}` : ""}`}
                      {ev.description && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{ev.description}</div>}
                    </div>
                    <button
                      style={{ ...styles.secondaryBtn, background: "#dc2626", color: "#fff", flexShrink: 0 }}
                      onClick={() => deleteEvent(ev.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={createEvent} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Title</label>
                <input
                  value={newEvent.title}
                  onChange={e => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
                  style={styles.input}
                  placeholder="e.g. Parents' Evening"
                  required
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Date</label>
                <input
                  type="date"
                  value={newEvent.event_date}
                  onChange={e => setNewEvent(prev => ({ ...prev, event_date: e.target.value }))}
                  style={styles.input}
                  required
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>Start (optional)</label>
                <input
                  type="time"
                  value={newEvent.start_time}
                  onChange={e => setNewEvent(prev => ({ ...prev, start_time: e.target.value }))}
                  style={styles.input}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontWeight: 600 }}>End (optional)</label>
                <input
                  type="time"
                  value={newEvent.end_time}
                  onChange={e => setNewEvent(prev => ({ ...prev, end_time: e.target.value }))}
                  style={styles.input}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                <label style={{ fontWeight: 600 }}>Description (optional)</label>
                <input
                  value={newEvent.description}
                  onChange={e => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                  style={styles.input}
                />
              </div>
              <button style={{ ...styles.actionBtn, marginTop: 0 }}>Add Event</button>
            </form>
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Class Schedule</h3>
            <p style={{ ...styles.text, fontSize: 13, color: "#64748b" }}>
              Pick a class, then add its sessions by date — the term is worked out automatically from the date you pick.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 320, marginBottom: 20 }}>
              <label style={{ fontWeight: 600 }}>Class</label>
              <select value={timetableClassId} onChange={e => loadTimetableSlots(e.target.value)} style={styles.input}>
                <option value="">Select a class...</option>
                {classes.map((cls: any) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.class_name}
                  </option>
                ))}
              </select>
            </div>

            {!timetableClassId ? (
              <p style={styles.text}>Select a class above to manage its schedule.</p>
            ) : (
              <>
                {timetableSlotsLoading ? (
                  <p style={styles.text}>Loading schedule...</p>
                ) : timetableSlots.length === 0 ? (
                  <p style={styles.text}>No slots yet for this class.</p>
                ) : (
                  <div style={{ overflowX: "auto", marginBottom: 20 }}>
                    <table style={{ ...styles.table, width: "100%" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left" }}>Date</th>
                          <th style={{ textAlign: "left" }}>Time</th>
                          <th style={{ textAlign: "left" }}>Subject</th>
                          <th style={{ textAlign: "left" }}>Teacher</th>
                          <th style={{ textAlign: "left" }}>Term</th>
                          <th style={{ textAlign: "center", width: 160 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...timetableSlots]
                          .sort((a, b) => a.slot_date.localeCompare(b.slot_date) || a.start_time.localeCompare(b.start_time))
                          .map(slot => (
                            <tr key={slot.id}>
                              <td>{formatDate(slot.slot_date)}</td>
                              <td>
                                {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                              </td>
                              <td>{slot.subject_name || "—"}</td>
                              <td>
                                {slot.teacher_first_name || slot.teacher_surname
                                  ? `${slot.teacher_first_name} ${slot.teacher_surname}`
                                  : "—"}
                              </td>
                              <td>{slot.term_name || "—"}</td>
                              <td style={{ textAlign: "center" }}>
                                <button style={{ ...styles.secondaryBtn, marginRight: 6 }} onClick={() => startEditSlot(slot)}>
                                  Edit
                                </button>
                                <button
                                  style={{ ...styles.secondaryBtn, background: "#dc2626", color: "#fff" }}
                                  onClick={() => deleteSlot(slot.id)}
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

                <h4 style={{ marginBottom: 8 }}>{editingSlotId ? "Edit Slot" : "Add Slot"}</h4>
                <form onSubmit={submitSlot} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontWeight: 600 }}>Date</label>
                    <input
                      type="date"
                      value={slotForm.slot_date}
                      onChange={e => setSlotForm(prev => ({ ...prev, slot_date: e.target.value }))}
                      style={styles.input}
                      required
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontWeight: 600 }}>Start</label>
                    <input
                      type="time"
                      value={slotForm.start_time}
                      onChange={e => setSlotForm(prev => ({ ...prev, start_time: e.target.value }))}
                      style={styles.input}
                      required
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontWeight: 600 }}>End</label>
                    <input
                      type="time"
                      value={slotForm.end_time}
                      onChange={e => setSlotForm(prev => ({ ...prev, end_time: e.target.value }))}
                      style={styles.input}
                      required
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontWeight: 600 }}>Subject (optional)</label>
                    <input
                      value={slotForm.subject_name}
                      onChange={e => setSlotForm(prev => ({ ...prev, subject_name: e.target.value }))}
                      style={styles.input}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontWeight: 600 }}>Teacher (optional)</label>
                    <select
                      value={slotForm.teacher_id}
                      onChange={e => setSlotForm(prev => ({ ...prev, teacher_id: e.target.value }))}
                      style={styles.input}
                    >
                      <option value="">None</option>
                      {teachers.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.first_name || t.surname ? `${t.first_name || ""} ${t.surname || ""}`.trim() : t.username}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...styles.actionBtn, marginTop: 0 }}>{editingSlotId ? "Save Changes" : "Add Slot"}</button>
                    {editingSlotId && (
                      <button type="button" onClick={cancelEditSlot} style={{ ...styles.secondaryBtn, marginTop: 0 }}>
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------------------- ANALYTICS ---------------------- */}
      {selectedSection === "analytics" && features.analytics_dashboard && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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

          {features.fees && (
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
      )}

      {/* ---------------------- BULK STUDENT UPLOAD ---------------------- */}
      {selectedSection === "bulkUpload" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleBulkUploadFile}
                data-testid="bulk-upload-file-input"
              />
            </div>

            {bulkUploadParseError && (
              <p style={{ ...styles.text, color: "#dc2626" }}>{bulkUploadParseError}</p>
            )}

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
                <strong>{bulkUploadSummary.succeeded}</strong> of <strong>{bulkUploadSummary.total}</strong> rows
                created successfully
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
                                  New parent account created. One-time password:{" "}
                                  <strong>{r.temporaryPassword}</strong> — share this with the parent
                                  directly, it won't be shown again.
                                </div>
                              ) : (
                                <div>Linked to existing parent.</div>
                              )}
                              {r.studentUsername && (
                                <div>
                                  Student login created. Username: <strong>{r.studentUsername}</strong>,
                                  one-time password: <strong>{r.studentTemporaryPassword}</strong> — share
                                  this with the family directly, it won't be shown again.
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

      {/* ---------------------- FEE TRACKING SECTION ---------------------- */}
      {selectedSection === "fees" && features.fees && <FeeTrackingSection />}

      {/* ---------------------- PASSWORD MANAGEMENT SECTION ---------------------- */}
      {selectedSection === "passwordManagement" && features.password_management && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Teachers</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ ...styles.table, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Teacher</th>
                    <th style={{ textAlign: "left" }}>Email</th>
                    <th style={{ textAlign: "center", width: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t: any) => (
                    <tr key={t.id}>
                      <td>{t.username}</td>
                      <td>{t.email || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => handleResetPassword(t.id, t.username)}
                          style={styles.secondaryBtn}
                        >
                          Reset Password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={{ marginBottom: 16 }}>Parents</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ ...styles.table, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Parent</th>
                    <th style={{ textAlign: "left" }}>Email</th>
                    <th style={{ textAlign: "center", width: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {parents
                    .filter((p: any) => p.parent_user_id)
                    .map((p: any) => (
                      <tr key={p.parent_id}>
                        <td>
                          {p.parent_first_name} {p.parent_last_name}
                        </td>
                        <td>{p.parent_email || "—"}</td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            onClick={() =>
                              handleResetPassword(
                                p.parent_user_id,
                                `${p.parent_first_name} ${p.parent_last_name}`
                              )
                            }
                            style={styles.secondaryBtn}
                          >
                            Reset Password
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </BaseDashboard>
  );
};

export default AdminDashboard;
