import { vi } from "vitest";

/**
 * Wires a mocked `api.get` with sensible empty-state defaults for every
 * endpoint the dashboards fetch on mount, keyed by URL prefix, so a
 * dashboard smoke test doesn't have to enumerate every call it makes just
 * to avoid a crash (e.g. `res.data.classes.map(...)` on an unmocked URL).
 */
export const installDashboardApiDefaults = (mockGet: ReturnType<typeof vi.fn>) => {
  const routes: [string, unknown][] = [
    ["/admin/classes", []],
    ["/admin/teachers", []],
    ["/admin/students-parents", []],
    ["/admin/pending-users", []],
    ["/admin/assigned-students", []],
    ["/admin/roles", []],
    ["/admin/parents", []],
    ["/admin/users-all", []],
    ["/features", { flags: {} }],
    ["/notifications/sent", []],
    ["/notifications", []],
    ["/student/classes", { classes: [] }],
    ["/student/tasks", { tasks: [] }],
    ["/parent/children", { children: [] }],
    ["/parent/tasks", { tasks: [] }],
    ["/teacher/classes", { classes: [] }],
    ["/teacher/tasks", { tasks: [] }],
    ["/system-admin/schools", []],
    ["/system-admin/feature-flags", { flags: [], schools: [], overrides: [] }],
    ["/report-cards/terms", { terms: [] }],
    ["/timetable/events", { events: [] }],
    ["/timetable/terms", { terms: [] }],
    ["/timetable/slots", { slots: [] }]
  ];

  mockGet.mockImplementation((url: string) => {
    const match = routes.find(([prefix]) => url === prefix || url.startsWith(prefix));
    if (match) return Promise.resolve({ data: match[1] });
    if (url.startsWith("/notes/students/")) return Promise.resolve({ data: { notes: [] } });
    if (url.startsWith("/report-cards/students/")) return Promise.resolve({ data: { reportCards: [] } });
    if (url.startsWith("/timetable/classes/") && url.endsWith("/terms")) return Promise.resolve({ data: { terms: [] } });
    if (url.startsWith("/timetable/classes/")) return Promise.resolve({ data: { slots: [] } });
    if (url.startsWith("/teacher/attendance/")) return Promise.resolve({ data: { students: [], history: [], date: "2026-01-01" } });
    if (url.startsWith("/teacher/classes/") && url.includes("/parent-contacts")) return Promise.resolve({ data: { guardians: [] } });
    return Promise.resolve({ data: [] });
  });
};
