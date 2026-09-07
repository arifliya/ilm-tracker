import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TeacherDashboard from "../../pages/dashboards/TeacherDashboard";
import { AuthContext } from "../../AuthContext";
import { api } from "../../api";
import { installDashboardApiDefaults } from "../helpers/mockApi";

vi.mock("../../api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

const authValue = {
  user: { userId: 1, username: "teacher1", role: "teacher" as const },
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn()
};

describe("TeacherDashboard (smoke)", () => {
  beforeEach(() => installDashboardApiDefaults(mockGet));

  it("loads and renders the default section without crashing", async () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <TeacherDashboard />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("My Classes")).toBeInTheDocument();
    expect(screen.getByText("Attendance")).toBeInTheDocument();
  });

  it("shows a student's parent contact info", async () => {
    const user = userEvent.setup();

    mockGet.mockImplementation((url: string) => {
      if (url === "/teacher/classes") {
        return Promise.resolve({ data: { classes: [{ id: 1, class_name: "7A", year_group: "Year 7" }] } });
      }
      if (url.startsWith("/teacher/attendance/1/history")) {
        return Promise.resolve({ data: { history: [] } });
      }
      if (url.startsWith("/teacher/attendance/1")) {
        return Promise.resolve({
          data: { students: [{ id: 5, first_name: "Adam", surname: "Khan" }], date: "2026-01-01" }
        });
      }
      if (url === "/teacher/classes/1/students/5/parent-contacts") {
        return Promise.resolve({
          data: {
            guardians: [
              {
                first_name: "Aisha",
                middle_name: null,
                surname: "Khan",
                relationship_to_student: "mother",
                contact_number: "07123456789",
                email: "aisha.khan@example.com"
              }
            ]
          }
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <TeacherDashboard />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    await user.click(await screen.findByText("My Classes"));
    await user.click(await screen.findByText("View Attendance"));
    await user.click(await screen.findByText("Parent Contact"));

    expect(await screen.findByText("07123456789")).toBeInTheDocument();
    expect(screen.getByText("aisha.khan@example.com")).toBeInTheDocument();
  });
});
