import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import OwnerDashboard from "../../pages/dashboards/OwnerDashboard";
import { AuthContext } from "../../AuthContext";
import { api } from "../../api";
import { installDashboardApiDefaults } from "../helpers/mockApi";

vi.mock("../../api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;

const authValue = {
  user: { userId: 1, username: "owner1", role: "owner" as const, schoolId: 10 } as any,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn()
};

describe("OwnerDashboard (smoke)", () => {
  beforeEach(() => installDashboardApiDefaults(mockGet));

  it("loads and renders the default section without crashing", async () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <OwnerDashboard />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Class Management")).toBeInTheDocument();
    expect(screen.getByText("Approvals")).toBeInTheDocument();
  });

  it("resets a student's password from Student & Parent Overview when a login already exists", async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === "/features") return Promise.resolve({ data: { flags: { password_management: true } } });
      if (url === "/admin/students-parents") {
        return Promise.resolve({
          data: {
            studentsParents: [
              {
                student_id: 701,
                student_user_id: 900,
                student_first_name: "Amy",
                student_last_name: "Doe",
                guardians: []
              }
            ],
            total: 1
          }
        });
      }
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({ data: { temporaryPassword: "Abc12345" } });

    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <OwnerDashboard />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    await user.click(await screen.findByText("Student & Parent Overview"));
    await user.click(await screen.findByText("▶ View"));
    await user.click(await screen.findByText("Reset Password"));
    await user.click(await screen.findByText("Confirm"));

    expect(mockPost).toHaveBeenCalledWith("/admin/users/900/reset-password");
    expect(await screen.findByText(/Password reset for Amy Doe/)).toBeInTheDocument();
  });
});
