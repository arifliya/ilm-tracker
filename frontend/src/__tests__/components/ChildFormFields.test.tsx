import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChildFormFields from "../../components/ChildFormFields";
import { emptyChildForm } from "../../utils/childForm";

// Labels here are plain siblings of their input (no htmlFor/id), so
// getByLabelText doesn't apply — find each field via the label's next
// sibling instead.
const fieldFor = (labelText: string) => {
  const label = screen.getByText(labelText);
  return label.nextElementSibling as HTMLInputElement | HTMLSelectElement;
};

describe("ChildFormFields", () => {
  it("renders all field labels and reflects the given values", () => {
    render(
      <ChildFormFields value={{ ...emptyChildForm, first_name: "Sam" }} onChange={() => {}} errors={{}} />
    );
    expect(fieldFor("First name *")).toHaveValue("Sam");
    expect(screen.getByText("Class code *")).toBeInTheDocument();
    expect(screen.getByText("Gender *")).toBeInTheDocument();
  });

  it("calls onChange with the field name and new value when typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChildFormFields value={emptyChildForm} onChange={onChange} errors={{}} />);

    await user.type(fieldFor("Surname *"), "D");
    expect(onChange).toHaveBeenCalledWith("surname", "D");
  });

  it("shows a field's error message only when present in errors", () => {
    const { rerender } = render(
      <ChildFormFields value={emptyChildForm} onChange={() => {}} errors={{}} />
    );
    expect(screen.queryByText("First name is required")).not.toBeInTheDocument();

    rerender(
      <ChildFormFields value={emptyChildForm} onChange={() => {}} errors={{ first_name: "First name is required" }} />
    );
    expect(screen.getByText("First name is required")).toBeInTheDocument();
  });

  it("selecting a gender option calls onChange with 'gender'", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChildFormFields value={emptyChildForm} onChange={onChange} errors={{}} />);

    await user.selectOptions(fieldFor("Gender *"), "Male");
    expect(onChange).toHaveBeenCalledWith("gender", "Male");
  });
});
