import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import NoDashboard from "../../pages/NoDashboard";
import { AuthContext } from "../../AuthContext";
import { api } from "../../api";

vi.mock("../../api", () => ({
  api: { get: vi.fn(), post: vi.fn() }
}));

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;

const renderPage = (logout = vi.fn().mockResolvedValue(undefined)) => {
  const value = {
    user: { userId: 1, username: "jdoe", role: "staff" as any },
    loading: false,
    login: vi.fn(),
    logout
  };
  return render(
    <MemoryRouter initialEntries={["/no-dashboard"]}>
      <AuthContext.Provider value={value}>
        <Routes>
          <Route path="/no-dashboard" element={<NoDashboard />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
};

describe("NoDashboard", () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({ data: [] });
  });

  it("shows the user's role and no notifications section when there are none", async () => {
    renderPage();
    expect(screen.getByText("staff")).toBeInTheDocument();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/notifications"));
    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
  });

  it("renders fetched notifications", async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: 1, title: "Hi", message: "Hello there", created_at: "2026-01-01", read_at: null, sender_first_name: "A", sender_last_name: "B" }
      ]
    });
    renderPage();

    expect(await screen.findByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Hi")).toBeInTheDocument();
  });

  it("marks an unread notification as read when clicked", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue({});
    mockGet.mockResolvedValue({
      data: [
        { id: 1, title: "Hi", message: "Hello there", created_at: "2026-01-01", read_at: null, sender_first_name: "A", sender_last_name: "B" }
      ]
    });
    renderPage();

    const card = await screen.findByText("Hi");
    await user.click(card);

    expect(mockPost).toHaveBeenCalledWith("/notifications/1/read");
  });

  it("logs out and navigates to /login", async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    renderPage(logout);

    await user.click(screen.getByText("Logout"));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Login Page")).toBeInTheDocument();
  });
});
