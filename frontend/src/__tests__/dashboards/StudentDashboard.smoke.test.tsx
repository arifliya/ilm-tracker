import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudentDashboard from "../../pages/dashboards/StudentDashboard";
import { AuthContext } from "../../AuthContext";
import { api } from "../../api";
import { installDashboardApiDefaults } from "../helpers/mockApi";

vi.mock("../../api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

const authValue = {
  user: { userId: 1, username: "student1", role: "student" as const },
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn()
};

describe("StudentDashboard (smoke)", () => {
  beforeEach(() => installDashboardApiDefaults(mockGet));

  it("loads and renders the default section without crashing", async () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <StudentDashboard />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "My Classes" })).toBeInTheDocument();
    expect(screen.getByText("You are not enrolled in any classes.")).toBeInTheDocument();
    expect(screen.getByText("My Tasks")).toBeInTheDocument();
  });

  it("shows a load-failure banner when the API errors", async () => {
    mockGet.mockRejectedValue({ response: { data: { message: "Failed to load classes" } } });

    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <StudentDashboard />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(await screen.findByText("Failed to load classes")).toBeInTheDocument();
  });
});
