import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuth } from "../../hooks/useAuth";
import { AuthContext } from "../../AuthContext";

describe("useAuth", () => {
  it("returns the default context value when there is no provider", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("returns whatever value the nearest AuthContext.Provider supplies", () => {
    const value = {
      user: { userId: 1, username: "jdoe", role: "admin" as const },
      loading: false,
      login: async () => {},
      logout: async () => {},
      refreshUser: async () => {}
    };

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    });

    expect(result.current.user).toEqual(value.user);
    expect(result.current.loading).toBe(false);
  });
});
