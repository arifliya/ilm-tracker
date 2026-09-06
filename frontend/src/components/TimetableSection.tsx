import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDate } from "../utils/formatDate";
import { useConfirm } from "./ConfirmDialog";

interface ClassOption {
  id: number;
  class_name: string | null;
}

interface TeacherOption {
  id: number;
  username: string;
  first_name: string | null;
  surname: string | null;
}

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

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

const todayStr = () => new Date().toISOString().slice(0, 10);
const emptySlotForm = () => ({ slot_date: "", start_time: "", end_time: "", subject_name: "", teacher_id: "" });

// Shared between AdminDashboard and OwnerDashboard — identical functionality
// for both roles, so it lives here rather than being duplicated.
const TimetableSection: React.FC = () => {
  const { confirm, ConfirmDialog } = useConfirm();

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [scheduleTerms, setScheduleTerms] = useState<Term[]>([]);
  const [newScheduleTerm, setNewScheduleTerm] = useState({ name: "", start_date: "", end_date: "" });
  const [expandedTermId, setExpandedTermId] = useState<number | null>(null);
  const [expandedTermSlots, setExpandedTermSlots] = useState<CalendarSlot[]>([]);
  const [expandedTermSlotsLoading, setExpandedTermSlotsLoading] = useState(false);

  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [newEvent, setNewEvent] = useState({ title: "", description: "", event_date: "", start_time: "", end_time: "" });

  const [timetableClassId, setTimetableClassId] = useState("");
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [timetableSlotsLoading, setTimetableSlotsLoading] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [slotForm, setSlotForm] = useState(emptySlotForm());

  useEffect(() => {
    api
      .get("/admin/classes")
      .then(res => setClasses(res.data || []))
      .catch(err => {
        console.error("Failed to load classes", err);
        setError(getErrorMessage(err, "Failed to load classes."));
      });
    api
      .get("/admin/teachers")
      .then(res => setTeachers(res.data || []))
      .catch(err => {
        console.error("Failed to load teachers", err);
        setError(getErrorMessage(err, "Failed to load teachers."));
      });
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const loadScheduleTerms = async () => {
    try {
      const res = await api.get("/timetable/terms");
      setScheduleTerms(res.data.terms || []);
    } catch (err) {
      console.error("Load schedule terms error:", err);
      setError(getErrorMessage(err, "Failed to load terms"));
    }
  };

  const loadEvents = async () => {
    try {
      const res = await api.get("/timetable/events");
      setEvents(res.data.events || []);
    } catch (err) {
      console.error("Load events error:", err);
      setError(getErrorMessage(err, "Failed to load events"));
    }
  };

  useEffect(() => {
    loadScheduleTerms();
    loadEvents();
  }, []);

  const createScheduleTerm = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/timetable/terms", newScheduleTerm);
      setNewScheduleTerm({ name: "", start_date: "", end_date: "" });
      const res = await api.get("/timetable/terms");
      setScheduleTerms(res.data.terms || []);
      setSuccess("Term created successfully.");
    } catch (err) {
      console.error("Create schedule term error:", err);
      setError(getErrorMessage(err, "Failed to create term"));
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
      setError(getErrorMessage(err, "Failed to load this term's schedule"));
    } finally {
      setExpandedTermSlotsLoading(false);
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
      setSuccess("Event created successfully.");
    } catch (err) {
      console.error("Create event error:", err);
      setError(getErrorMessage(err, "Failed to create event"));
    }
  };

  const deleteEvent = async (id: number) => {
    if (!(await confirm("Are you sure you want to delete this event?"))) return;

    try {
      await api.delete(`/timetable/events/${id}`);
      setEvents(prev => prev.filter(e => e.id !== id));
      setSuccess("Event deleted successfully.");
    } catch (err) {
      console.error("Delete event error:", err);
      setError(getErrorMessage(err, "Failed to delete event"));
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
      setError(getErrorMessage(err, "Failed to load timetable"));
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
        setSuccess("Timetable slot updated.");
      } else {
        await api.post(`/timetable/classes/${timetableClassId}/slots`, body);
        setSuccess("Timetable slot created.");
      }
      const res = await api.get(`/timetable/classes/${timetableClassId}/slots`);
      setTimetableSlots(res.data.slots || []);
      cancelEditSlot();
    } catch (err) {
      console.error("Save timetable slot error:", err);
      setError(getErrorMessage(err, "Failed to save timetable slot"));
    }
  };

  const deleteSlot = async (id: number) => {
    if (!(await confirm("Are you sure you want to delete this timetable slot?"))) return;

    try {
      await api.delete(`/timetable/slots/${id}`);
      setTimetableSlots(prev => prev.filter(s => s.id !== id));
      setSuccess("Timetable slot deleted.");
    } catch (err) {
      console.error("Delete timetable slot error:", err);
      setError(getErrorMessage(err, "Failed to delete timetable slot"));
    }
  };

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
            {classes.map((cls) => (
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
                  {teachers.map((t) => (
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
  );
};

export default TimetableSection;
