import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useConfirm } from "../../components/ConfirmDialog";

const Harness: React.FC<{ onResult: (v: boolean) => void }> = ({ onResult }) => {
  const { confirm, ConfirmDialog } = useConfirm();

  return (
    <>
      <button onClick={async () => onResult(await confirm("Remove this student?"))}>Ask</button>
      {ConfirmDialog}
    </>
  );
};

describe("useConfirm / ConfirmDialog", () => {
  it("renders no dialog until confirm() is called", () => {
    render(<Harness onResult={() => {}} />);
    expect(screen.queryByText("Remove this student?")).not.toBeInTheDocument();
  });

  it("resolves true when Confirm is clicked", async () => {
    const user = userEvent.setup();
    let result: boolean | undefined;
    render(<Harness onResult={v => (result = v)} />);

    await user.click(screen.getByText("Ask"));
    expect(screen.getByText("Remove this student?")).toBeInTheDocument();

    await user.click(screen.getByText("Confirm"));
    expect(result).toBe(true);
    expect(screen.queryByText("Remove this student?")).not.toBeInTheDocument();
  });

  it("resolves false when Cancel is clicked", async () => {
    const user = userEvent.setup();
    let result: boolean | undefined;
    render(<Harness onResult={v => (result = v)} />);

    await user.click(screen.getByText("Ask"));
    await user.click(screen.getByText("Cancel"));

    expect(result).toBe(false);
  });

  it("resolves false when clicking the overlay outside the dialog box", async () => {
    const user = userEvent.setup();
    let result: boolean | undefined;
    render(<Harness onResult={v => (result = v)} />);

    await user.click(screen.getByText("Ask"));
    await user.click(screen.getByText("Remove this student?").parentElement!.parentElement!);

    expect(result).toBe(false);
  });
});
