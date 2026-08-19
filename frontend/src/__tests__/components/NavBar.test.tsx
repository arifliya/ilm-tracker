import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Navbar from "../../components/NavBar";
import { AuthContext } from "../../AuthContext";

const renderNavbar = (user: any, logout = vi.fn().mockResolvedValue(undefined), onMenuClick?: () => void) => {
  const value = { user, loading: false, login: vi.fn(), logout };
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={value}>
        <Navbar onMenuClick={onMenuClick} />
      </AuthContext.Provider>
    </MemoryRouter>
  );
};

describe("Navbar", () => {
  it("prefers fullName over username for the displayed name", () => {
    renderNavbar({ userId: 1, username: "jdoe", role: "admin", fullName: "Jane Doe" });
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("falls back to username when fullName is absent", () => {
    renderNavbar({ userId: 1, username: "jdoe", role: "admin" });
    expect(screen.getByText("jdoe")).toBeInTheDocument();
  });

  it("does not render the menu toggle when onMenuClick is not provided", () => {
    renderNavbar({ userId: 1, username: "jdoe", role: "admin" });
    expect(screen.queryByLabelText("Toggle menu")).not.toBeInTheDocument();
  });

  it("renders and wires up the menu toggle when provided", async () => {
    const user = userEvent.setup();
    const onMenuClick = vi.fn();
    renderNavbar({ userId: 1, username: "jdoe", role: "admin" }, undefined, onMenuClick);

    await user.click(screen.getByLabelText("Toggle menu"));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it("calls logout when the Logout button is clicked", async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    renderNavbar({ userId: 1, username: "jdoe", role: "admin" }, logout);

    await user.click(screen.getByText("Logout"));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
