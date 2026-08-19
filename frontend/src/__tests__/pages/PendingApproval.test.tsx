import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PendingApproval from "../../pages/PendingApproval";
import { AuthContext } from "../../AuthContext";

describe("PendingApproval", () => {
  it("shows the pending-approval message", () => {
    const value = { user: null, loading: false, login: vi.fn(), logout: vi.fn() };
    render(
      <MemoryRouter>
        <AuthContext.Provider value={value}>
          <PendingApproval />
        </AuthContext.Provider>
      </MemoryRouter>
    );
    expect(screen.getByText("Account Pending Approval")).toBeInTheDocument();
  });

  it("logs out and navigates to /login when Logout is clicked", async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    const value = { user: null, loading: false, login: vi.fn(), logout };

    render(
      <MemoryRouter initialEntries={["/pending"]}>
        <AuthContext.Provider value={value}>
          <Routes>
            <Route path="/pending" element={<PendingApproval />} />
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    await user.click(screen.getByText("Logout"));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Login Page")).toBeInTheDocument();
  });
});
