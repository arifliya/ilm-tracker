import { vi } from "vitest";

/**
 * Wires a mocked `api.get` with sensible empty-state defaults for every
 * endpoint the dashboards fetch on mount, keyed by URL prefix, so a
 * dashboard smoke test doesn't have to enumerate every call it makes just
 * to avoid a crash (e.g. `res.data.classes.map(...)` on an unmocked URL).
 */
// /admin/teachers, /admin/students-parents, and /admin/parents are called
// two ways by the real dashboards: with no page/pageSize (a dropdown
// source — needs the plain array shape) and with page/pageSize (a
// paginated table — needs { <itemsKey>, total }). A single static mock
// value can't satisfy both call shapes, so these three branch on whether
// the call actually asked for a page.
const DUAL_MODE_ROUTES: Record<string, string> = {
  "/admin/teachers": "teachers",
  "/admin/students-parents": "studentsParents",
  "/admin/parents": "parents"
};

export const installDashboardApiDefaults = (mockGet: ReturnType<typeof vi.fn>) => {
  const routes: [string, unknown][] = [
    ["/admin/classes", []],
    ["/admin/pending-users", { pendingUsers: [], total: 0 }],
    ["/admin/assigned-students", []],
    ["/admin/roles", []],
    ["/admin/users-all", { users: [], total: 0 }],
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

  mockGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    const dualMatch = Object.entries(DUAL_MODE_ROUTES).find(([prefix]) => url === prefix || url.startsWith(prefix));
    if (dualMatch) {
      const [, itemsKey] = dualMatch;
      const paginated = config?.params?.page !== undefined || config?.params?.pageSize !== undefined;
      return Promise.resolve({ data: paginated ? { [itemsKey]: [], total: 0 } : [] });
    }
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
