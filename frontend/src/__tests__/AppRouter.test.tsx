import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AppRouter from "../AppRouter";
import { AuthProvider } from "../AuthContext";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { response: { use: vi.fn() } }
  }
}));

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

const renderAt = (path: string) => {
  window.history.pushState({}, "", path);
  return render(
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
};

describe("AppRouter", () => {
  beforeEach(() => {
    mockGet.mockRejectedValue({ response: { status: 401 } });
  });

  it("renders Home at / with the footer visible", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Ilm Tracker" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeInTheDocument();
  });

  it("renders Login at /login with no footer", async () => {
    renderAt("/login");
    expect(await screen.findByRole("button", { name: "Login" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Privacy Policy" })).not.toBeInTheDocument();
  });

  it("renders Register at /register with the footer visible", async () => {
    renderAt("/register");
    expect(await screen.findByText("Parent details")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeInTheDocument();
  });

  it("renders the Privacy Policy page with the footer also visible", async () => {
    renderAt("/privacy-policy");
    expect(await screen.findByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeInTheDocument();
  });

  it("redirects an unauthenticated user away from /dashboard to /login", async () => {
    renderAt("/dashboard");
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/auth/me"));
    expect(await screen.findByRole("button", { name: "Login" })).toBeInTheDocument();
  });

  it("redirects a user with mustResetPassword to /force-password-reset instead of their dashboard", async () => {
    mockGet.mockResolvedValue({
      data: { user: { userId: 1, username: "jdoe", role: "teacher", mustResetPassword: true } }
    });

    renderAt("/dashboard");

    expect(await screen.findByRole("heading", { name: "Password Reset Required" })).toBeInTheDocument();
  });

  it("redirects an unknown path back to Home", async () => {
    renderAt("/this-route-does-not-exist");
    expect(await screen.findByRole("heading", { name: "Ilm Tracker" })).toBeInTheDocument();
  });
});
