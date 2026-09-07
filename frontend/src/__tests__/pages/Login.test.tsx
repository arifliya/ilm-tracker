import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Login from "../../pages/Login";
import { AuthContext } from "../../AuthContext";

const renderLogin = (login = vi.fn().mockResolvedValue(undefined), initialEntries: any[] = ["/login"]) => {
  const value = { user: null, loading: false, login, logout: vi.fn(), refreshUser: vi.fn() };
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthContext.Provider value={value}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<div>Dashboard Page</div>} />
          <Route path="/register" element={<div>Register Page</div>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
};

// The Username/Password labels are plain siblings of their inputs (no
// htmlFor/id), so getByLabelText doesn't apply here.
const fieldFor = (labelText: string) => screen.getByText(labelText).nextElementSibling as HTMLInputElement;

describe("Login", () => {
  it("shows a validation error when submitting an empty form", async () => {
    const user = userEvent.setup();
    const login = vi.fn();
    renderLogin(login);

    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(screen.getByText("Username and password are required")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("logs in and navigates to /dashboard on success", async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue(undefined);
    renderLogin(login);

    await user.type(fieldFor("Username"), "jdoe");
    await user.type(fieldFor("Password"), "Passw0rd!");
    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(login).toHaveBeenCalledWith("jdoe", "Passw0rd!");
    expect(await screen.findByText("Dashboard Page")).toBeInTheDocument();
  });

  it("shows the server's error message when login fails", async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue({ response: { data: { message: "Invalid credentials" } } });
    renderLogin(login);

    await user.type(fieldFor("Username"), "jdoe");
    await user.type(fieldFor("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });

  it("shows a notice banner carried over via location state", () => {
    renderLogin(undefined, [
      { pathname: "/login", state: { reason: "You have been logged out due to inactivity." } }
    ]);
    expect(screen.getByText("You have been logged out due to inactivity.")).toBeInTheDocument();
  });

  it("navigates to /register when the Register link is clicked", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByText("Register"));
    expect(await screen.findByText("Register Page")).toBeInTheDocument();
  });
});
