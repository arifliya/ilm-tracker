import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { dashboardStyles as styles } from "../../styles/dashboardStyles";
import BaseDashboard, { DashboardNavItem } from "../../components/BaseDashboard";
import { getErrorMessage } from "../../utils/getErrorMessage";
import { usePolling } from "../../hooks/usePolling";

const POLL_INTERVAL_MS = 30000;

type SectionKey = "classes" | "tasks";

const NAV_ITEMS: DashboardNavItem[] = [
  { key: "classes", icon: "🏫", label: "My Classes" },
  { key: "tasks", icon: "📝", label: "My Tasks" }
];

const SECTION_TITLES: Record<SectionKey, string> = {
  classes: "My Classes",
  tasks: "My Tasks"
};

const StudentDashboard: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSection, setSelectedSection] = useState<SectionKey>("classes");
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      const classRes = await api.get("/student/classes");
      const taskRes = await api.get("/student/tasks");

      setClasses(classRes.data.classes || []);
      setTasks(taskRes.data.tasks || []);
      setLoadError(null);
    } catch (err) {
      console.error("Student dashboard error:", err);
      setLoadError(getErrorMessage(err, "Failed to load dashboard data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  usePolling(loadDashboard, POLL_INTERVAL_MS);

  return (
    <BaseDashboard
      navItems={NAV_ITEMS}
      selectedSection={selectedSection}
      onSelectSection={key => setSelectedSection(key as SectionKey)}
      title={SECTION_TITLES[selectedSection]}
      loading={loading}
      error={loadError}
      onDismissError={() => setLoadError(null)}
    >
      {/* ---------------------- CLASSES SECTION ---------------------- */}
      {selectedSection === "classes" && (
        <div style={styles.card}>
          {classes.length === 0 ? (
            <p style={styles.text}>You are not enrolled in any classes.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Class Name</th>
                  <th style={{ textAlign: "left" }}>Year Group</th>
                </tr>
              </thead>

              <tbody>
                {classes.map((cls) => (
                  <tr key={cls.id}>
                    <td>
                      <strong>{cls.class_name}</strong>
                    </td>
                    <td>{cls.year_group}</td>
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
          {tasks.length === 0 ? (
            <p style={styles.text}>No tasks assigned yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ ...styles.table, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Title</th>
                  <th style={{ textAlign: "left" }}>Class</th>
                  <th style={{ textAlign: "left" }}>Due Date</th>
                  <th style={{ textAlign: "left" }}>Description</th>
                </tr>
              </thead>

              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.title}</strong>
                    </td>
                    <td>{task.class_name}</td>
                    <td>{task.due_date}</td>
                    <td>{task.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </BaseDashboard>
  );
};

export default StudentDashboard;
