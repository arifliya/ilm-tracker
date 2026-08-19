import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Register from "../../pages/Register";
import { api } from "../../api";

vi.mock("../../api", () => ({
  api: { post: vi.fn() }
}));

const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;

// Labels are plain siblings of their input/select (no htmlFor/id) — find
// each field via the label's next sibling. Some labels ("First name *",
// "Surname *") appear twice (parent section + the per-student
// ChildFormFields), hence the `index` param.
const fieldAt = (labelText: string, index = 0) =>
  screen.getAllByText(labelText)[index].nextElementSibling as HTMLInputElement | HTMLSelectElement;

const renderRegister = () =>
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );

describe("Register", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it("defaults to the Parent tab", () => {
    renderRegister();
    expect(screen.getByText("Parent details")).toBeInTheDocument();
  });

  it("switches to the Staff tab and shows staff-only fields", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole("button", { name: "Staff" }));

    expect(screen.getByText("Staff details")).toBeInTheDocument();
    expect(screen.queryByText("Parent details")).not.toBeInTheDocument();
    expect(screen.getByText("Phone number *")).toBeInTheDocument();
  });

  it("shows field-level validation errors on an empty parent submit, without calling the API", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole("button", { name: "Submit parent registration" }));

    expect(screen.getByText("School code is required")).toBeInTheDocument();
    expect(screen.getByText("Relationship is required")).toBeInTheDocument();
    expect(screen.getByText("Contact number is required")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("shows field-level validation errors on an empty staff submit, without calling the API", async () => {
    const user = userEvent.setup();
    renderRegister();
    await user.click(screen.getByRole("button", { name: "Staff" }));

    await user.click(screen.getByRole("button", { name: "Submit staff registration" }));

    expect(screen.getByText("School code is required")).toBeInTheDocument();
    expect(screen.getByText("Gender is required")).toBeInTheDocument();
    expect(screen.getByText("Phone number is required")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("adds and removes additional student blocks", async () => {
    const user = userEvent.setup();
    renderRegister();

    expect(screen.getByText("Student 1")).toBeInTheDocument();
    expect(screen.queryByText("Remove this student")).not.toBeInTheDocument();

    await user.click(screen.getByText("Add another student"));
    expect(screen.getByText("Student 2")).toBeInTheDocument();
    expect(screen.getAllByText("Remove this student")).toHaveLength(2);

    await user.click(screen.getAllByText("Remove this student")[1]);
    expect(screen.queryByText("Student 2")).not.toBeInTheDocument();
  });

  it("registers a parent successfully end to end and shows the success screen", async () => {
    const user = userEvent.setup();
    mockPost.mockImplementation((url: string) => {
      if (url === "/auth/check-duplicate") return Promise.resolve({ data: { exists: false } });
      if (url === "/auth/register-parent") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderRegister();

    await user.type(fieldAt("School code *"), "ILM2026");
    await user.type(fieldAt("First name *", 0), "Jane");
    await user.type(fieldAt("Surname *", 0), "Doe");
    await user.selectOptions(fieldAt("Relationship to student *"), "Parent - Mother");
    await user.type(fieldAt("Contact number *"), "5551234");
    await user.type(fieldAt("Email *"), "jane@example.com");
    await user.type(fieldAt("Password *"), "Passw0rd!");

    await user.type(fieldAt("First name *", 1), "Sam");
    await user.type(fieldAt("Surname *", 1), "Doe");
    await user.selectOptions(fieldAt("Gender *"), "Male");
    await user.type(fieldAt("Class code *"), "7A");
    await user.type(fieldAt("Date of birth *"), "2015-01-01");
    await user.type(fieldAt("Address line 1 *"), "1 Road");
    await user.type(fieldAt("City *"), "Town");
    await user.type(fieldAt("Postcode *"), "AB1 2CD");

    await user.click(screen.getByRole("button", { name: "Submit parent registration" }));

    expect(await screen.findByText("Registration Submitted")).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith(
      "/auth/register-parent",
      expect.objectContaining({ school_code: "ILM2026" })
    );
  });

  it("shows an error and does not register when the email is already taken", async () => {
    const user = userEvent.setup();
    mockPost.mockImplementation((url: string) => {
      if (url === "/auth/check-duplicate") return Promise.resolve({ data: { exists: true, reason: "email" } });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderRegister();

    await user.type(fieldAt("School code *"), "ILM2026");
    await user.type(fieldAt("First name *", 0), "Jane");
    await user.type(fieldAt("Surname *", 0), "Doe");
    await user.selectOptions(fieldAt("Relationship to student *"), "Parent - Mother");
    await user.type(fieldAt("Contact number *"), "5551234");
    await user.type(fieldAt("Email *"), "jane@example.com");
    await user.type(fieldAt("Password *"), "Passw0rd!");

    await user.type(fieldAt("First name *", 1), "Sam");
    await user.type(fieldAt("Surname *", 1), "Doe");
    await user.selectOptions(fieldAt("Gender *"), "Male");
    await user.type(fieldAt("Class code *"), "7A");
    await user.type(fieldAt("Date of birth *"), "2015-01-01");
    await user.type(fieldAt("Address line 1 *"), "1 Road");
    await user.type(fieldAt("City *"), "Town");
    await user.type(fieldAt("Postcode *"), "AB1 2CD");

    await user.click(screen.getByRole("button", { name: "Submit parent registration" }));

    expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument();
    expect(screen.queryByText("Registration Submitted")).not.toBeInTheDocument();
  });
});
