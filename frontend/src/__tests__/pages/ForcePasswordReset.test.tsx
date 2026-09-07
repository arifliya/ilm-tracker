import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ForcePasswordReset from "../../pages/ForcePasswordReset";
import { AuthContext } from "../../AuthContext";
import { api } from "../../api";

vi.mock("../../api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;

// The New/Confirm password labels are plain siblings of their inputs (no
// htmlFor/id), so getByLabelText doesn't apply here — same pattern as
// Login.test.tsx's fieldFor helper.
const fieldFor = (labelText: string) => screen.getByText(labelText).nextElementSibling as HTMLInputElement;

const renderPage = (refreshUser = vi.fn().mockResolvedValue(undefined), logout = vi.fn().mockResolvedValue(undefined)) => {
  const value = { user: null, loading: false, login: vi.fn(), logout, refreshUser };
  return render(
    <MemoryRouter initialEntries={["/force-password-reset"]}>
      <AuthContext.Provider value={value}>
        <Routes>
          <Route path="/force-password-reset" element={<ForcePasswordReset />} />
          <Route path="/dashboard" element={<div>Dashboard Page</div>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
};

describe("ForcePasswordReset", () => {
  it("shows the forced-reset message", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Password Reset Required" })).toBeInTheDocument();
  });

  it("rejects a mismatched confirmation without calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(fieldFor("New password"), "NewPassw0rd!");
    await user.type(fieldFor("Confirm new password"), "Different1!");
    await user.click(screen.getByRole("button", { name: "Set New Password" }));

    expect(await screen.findByText("New password and confirmation do not match.")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("rejects a weak password without calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(fieldFor("New password"), "short");
    await user.type(fieldFor("Confirm new password"), "short");
    await user.click(screen.getByRole("button", { name: "Set New Password" }));

    expect(await screen.findByText(/at least 8 characters/)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("submits the new password, refreshes the user, and navigates to /dashboard", async () => {
    const user = userEvent.setup();
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    mockPost.mockResolvedValue({ data: { message: "Password updated" } });

    renderPage(refreshUser);

    await user.type(fieldFor("New password"), "NewPassw0rd!");
    await user.type(fieldFor("Confirm new password"), "NewPassw0rd!");
    await user.click(screen.getByRole("button", { name: "Set New Password" }));

    expect(mockPost).toHaveBeenCalledWith("/auth/force-password-reset", { new_password: "NewPassw0rd!" });
    expect(await screen.findByText("Dashboard Page")).toBeInTheDocument();
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it("logs out and navigates to /login when Logout is clicked", async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    renderPage(undefined, logout);

    await user.click(screen.getByText("Logout"));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Login Page")).toBeInTheDocument();
  });
});
