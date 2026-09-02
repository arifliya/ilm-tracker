import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import BaseDashboard from "../../components/BaseDashboard";
import { AuthContext } from "../../AuthContext";

const authValue = { user: null, loading: false, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() };

const renderDashboard = (props: Partial<React.ComponentProps<typeof BaseDashboard>> = {}) =>
  render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <BaseDashboard
          navItems={[{ key: "home", icon: "🏠", label: "Home" }, { key: "profile", icon: "👤", label: "Profile" }]}
          selectedSection="home"
          onSelectSection={() => {}}
          title="Dashboard"
          {...props}
        >
          <div>Body content</div>
        </BaseDashboard>
      </AuthContext.Provider>
    </MemoryRouter>
  );

describe("BaseDashboard", () => {
  it("shows a loading message instead of the shell when loading", () => {
    renderDashboard({ loading: true });
    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
    expect(screen.queryByText("Body content")).not.toBeInTheDocument();
  });

  it("renders the title, nav items and children", () => {
    renderDashboard();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("calls onSelectSection when a nav item is clicked", async () => {
    const user = userEvent.setup();
    const onSelectSection = vi.fn();
    renderDashboard({ onSelectSection });

    await user.click(screen.getByText("Profile"));
    expect(onSelectSection).toHaveBeenCalledWith("profile");
  });

  it("shows an error banner with a working dismiss button", async () => {
    const user = userEvent.setup();
    const onDismissError = vi.fn();
    renderDashboard({ error: "Something broke", onDismissError });

    expect(screen.getByText("Something broke")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Dismiss error"));
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });

  it("shows a success banner with a working dismiss button", async () => {
    const user = userEvent.setup();
    const onDismissSuccess = vi.fn();
    renderDashboard({ success: "Saved!", onDismissSuccess });

    expect(screen.getByText("Saved!")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Dismiss success message"));
    expect(onDismissSuccess).toHaveBeenCalledTimes(1);
  });

  it("renders no banners when there is no error or success", () => {
    renderDashboard();
    expect(screen.queryByLabelText("Dismiss error")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dismiss success message")).not.toBeInTheDocument();
  });
});
