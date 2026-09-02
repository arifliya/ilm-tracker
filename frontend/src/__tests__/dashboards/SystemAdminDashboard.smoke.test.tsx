import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SystemAdminDashboard from "../../pages/dashboards/SystemAdminDashboard";
import { AuthContext } from "../../AuthContext";
import { api } from "../../api";
import { installDashboardApiDefaults } from "../helpers/mockApi";

vi.mock("../../api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;

const authValue = {
  user: { userId: 1, username: "sysadmin", role: "system_admin" as const, schoolId: null } as any,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn()
};

describe("SystemAdminDashboard (smoke)", () => {
  beforeEach(() => installDashboardApiDefaults(mockGet));

  it("loads and renders the default section without crashing", async () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <SystemAdminDashboard />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByText("Schools").length).toBeGreaterThan(0);
    expect(screen.getByText("Class Management")).toBeInTheDocument();
  });

  it("resets an owner's password from the Password Management section", async () => {
    const user = userEvent.setup();

    mockGet.mockImplementation((url: string) => {
      if (url === "/admin/users-all") {
        return Promise.resolve({
          data: [
            { id: 9, username: "owner1", email: "owner1@example.com", role: "owner", school_name: "Ilm School" },
            { id: 10, username: "teacher1", email: "teacher1@example.com", role: "teacher", school_name: "Ilm School" }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({ data: { message: "Password reset", temporaryPassword: "Temp1234!" } });

    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <SystemAdminDashboard />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    await user.click(await screen.findByText("Password Management"));
    expect(await screen.findByText("owner1")).toBeInTheDocument();
    expect(screen.queryByText("teacher1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset Password" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(mockPost).toHaveBeenCalledWith("/system-admin/owners/9/reset-password");
    expect(await screen.findByText(/Temp1234!/)).toBeInTheDocument();
  });

  it("generates a student login from Student & Parent Overview when one doesn't exist yet", async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === "/admin/students-parents") {
        return Promise.resolve({
          data: [
            {
              student_id: 701,
              student_user_id: null,
              student_first_name: "Amy",
              student_last_name: "Doe",
              guardians: []
            }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({ data: { username: "Amy Doe", temporaryPassword: "Abc12345" } });

    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <SystemAdminDashboard />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    await user.click(await screen.findByText("Student & Parent Overview"));
    await user.click(await screen.findByText("▶ View"));
    await user.click(await screen.findByText("Generate Login"));
    await user.click(await screen.findByText("Confirm"));

    expect(mockPost).toHaveBeenCalledWith("/admin/students/701/generate-login");
    expect(await screen.findByText(/Login created for Amy Doe/)).toBeInTheDocument();
  });
});
