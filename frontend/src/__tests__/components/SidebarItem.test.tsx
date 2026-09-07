import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SidebarItem from "../../components/SidebarItem";

describe("SidebarItem", () => {
  it("renders its icon and label", () => {
    render(<SidebarItem icon="🏠" label="Home" active={false} onClick={() => {}} />);
    expect(screen.getByText("🏠")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SidebarItem icon="🏠" label="Home" active={false} onClick={onClick} />);

    await user.click(screen.getByText("Home"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies active styling when active is true", () => {
    render(<SidebarItem icon="🏠" label="Home" active={true} onClick={() => {}} />);
    const label = screen.getByText("Home");
    expect(label.parentElement).toHaveStyle({ color: "rgb(255, 255, 255)" });
  });
});
