import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination from "../../components/Pagination";

describe("Pagination", () => {
  it("shows page 1 of 1 and disables both buttons when there is only one page", () => {
    render(<Pagination page={0} setPage={() => {}} total={5} pageSize={10} />);
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Previous")).toBeDisabled();
    expect(screen.getByText("Next")).toBeDisabled();
  });

  it("disables Previous on the first page and enables Next", () => {
    render(<Pagination page={0} setPage={() => {}} total={25} pageSize={10} />);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Previous")).toBeDisabled();
    expect(screen.getByText("Next")).not.toBeDisabled();
  });

  it("disables Next on the last page", () => {
    render(<Pagination page={2} setPage={() => {}} total={25} pageSize={10} />);
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeDisabled();
  });

  it("calls setPage with page-1/page+1 on click", async () => {
    const user = userEvent.setup();
    const setPage = vi.fn();
    render(<Pagination page={1} setPage={setPage} total={25} pageSize={10} />);

    await user.click(screen.getByText("Next"));
    expect(setPage).toHaveBeenCalledWith(2);

    await user.click(screen.getByText("Previous"));
    expect(setPage).toHaveBeenCalledWith(0);
  });
});
