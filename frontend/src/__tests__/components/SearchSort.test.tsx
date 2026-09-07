import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchSort, { SORT_OPTIONS } from "../../components/SearchSort";

describe("SearchSort", () => {
  it("renders the search box with the current value and all sort options", () => {
    render(<SearchSort search="sam" onSearch={() => {}} sort="az" onSort={() => {}} />);
    expect(screen.getByPlaceholderText("Search...")).toHaveValue("sam");
    SORT_OPTIONS.forEach(opt => {
      expect(screen.getByRole("option", { name: opt.label })).toBeInTheDocument();
    });
  });

  it("calls onSearch as the user types", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchSort search="" onSearch={onSearch} sort="az" onSort={() => {}} />);

    await user.type(screen.getByPlaceholderText("Search..."), "a");
    expect(onSearch).toHaveBeenCalledWith("a");
  });

  it("calls onSort when a new option is selected", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(<SearchSort search="" onSearch={() => {}} sort="az" onSort={onSort} />);

    await user.selectOptions(screen.getByRole("combobox"), "new");
    expect(onSort).toHaveBeenCalledWith("new");
  });
});
