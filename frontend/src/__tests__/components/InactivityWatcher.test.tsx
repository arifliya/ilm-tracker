import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import InactivityWatcher from "../../components/InactivityWatcher";
import { AuthContext } from "../../AuthContext";

describe("InactivityWatcher", () => {
  it("renders nothing and does not crash with no logged-in user", () => {
    const value = { user: null, loading: false, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() };
    const { container } = render(
      <MemoryRouter>
        <AuthContext.Provider value={value}>
          <InactivityWatcher />
        </AuthContext.Provider>
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while tracking a logged-in user", () => {
    const value = {
      user: { userId: 1, username: "jdoe", role: "admin" as const },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn()
    };
    const { container } = render(
      <MemoryRouter>
        <AuthContext.Provider value={value}>
          <InactivityWatcher />
        </AuthContext.Provider>
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
