import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async importOriginal => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useInactivityLogout } from "../../hooks/useInactivityLogout";
import { AuthContext } from "../../AuthContext";

const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

const renderWithUser = (user: any, logout = vi.fn().mockResolvedValue(undefined)) => {
  const value = { user, loading: false, login: vi.fn(), logout };
  const result = renderHook(() => useInactivityLogout(), {
    wrapper: ({ children }) => <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  });
  return { ...result, logout };
};

describe("useInactivityLogout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigateMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when there is no logged-in user", () => {
    renderWithUser(null);
    vi.advanceTimersByTime(INACTIVITY_LIMIT_MS + 1000);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("logs out and redirects after the inactivity limit elapses", async () => {
    const { logout } = renderWithUser({ userId: 1, username: "jdoe", role: "admin" });

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS + 100);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/login", {
      replace: true,
      state: { reason: "You have been logged out due to inactivity." }
    });
  });

  it("resets the timer on activity, so it does not time out prematurely", async () => {
    const { logout } = renderWithUser({ userId: 1, username: "jdoe", role: "admin" });

    vi.advanceTimersByTime(INACTIVITY_LIMIT_MS - 1000);
    window.dispatchEvent(new Event("mousemove"));
    vi.advanceTimersByTime(INACTIVITY_LIMIT_MS - 1000);

    expect(logout).not.toHaveBeenCalled();
  });

  it("clears its timer and listeners on unmount", () => {
    const { unmount, logout } = renderWithUser({ userId: 1, username: "jdoe", role: "admin" });
    unmount();
    vi.advanceTimersByTime(INACTIVITY_LIMIT_MS + 1000);
    expect(logout).not.toHaveBeenCalled();
  });
});
