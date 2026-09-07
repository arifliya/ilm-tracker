import { describe, it, expect } from "vitest";
import { emptyChildForm, validateChildForm, ChildFormData } from "../../utils/childForm";

const validChild: ChildFormData = {
  ...emptyChildForm,
  first_name: "Sam",
  surname: "Doe",
  gender: "Male",
  date_of_birth: "2015-01-01",
  address1: "1 Road",
  city: "Town",
  postcode: "AB1 2CD",
  class_code: "7A"
};

describe("validateChildForm", () => {
  it("returns no errors for a fully valid child", () => {
    expect(validateChildForm(validChild)).toEqual({});
  });

  it("flags every required field as missing on an empty form", () => {
    const errors = validateChildForm(emptyChildForm);
    expect(errors.first_name).toBeTruthy();
    expect(errors.surname).toBeTruthy();
    expect(errors.gender).toBeTruthy();
    expect(errors.date_of_birth).toBeTruthy();
    expect(errors.address1).toBeTruthy();
    expect(errors.city).toBeTruthy();
    expect(errors.postcode).toBeTruthy();
    expect(errors.class_code).toBeTruthy();
    expect(errors.middle_name).toBeUndefined();
    expect(errors.address2).toBeUndefined();
  });

  it("rejects a first name with invalid characters", () => {
    const errors = validateChildForm({ ...validChild, first_name: "Sam123" });
    expect(errors.first_name).toMatch(/invalid characters/);
  });

  it("rejects a gender outside Male/Female", () => {
    const errors = validateChildForm({ ...validChild, gender: "Other" });
    expect(errors.gender).toMatch(/Male or Female/);
  });

  it("rejects an unparseable date of birth", () => {
    const errors = validateChildForm({ ...validChild, date_of_birth: "not-a-date" });
    expect(errors.date_of_birth).toMatch(/Invalid date/);
  });

  it("rejects a future date of birth", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const errors = validateChildForm({ ...validChild, date_of_birth: future.toISOString().slice(0, 10) });
    expect(errors.date_of_birth).toMatch(/cannot be in the future/);
  });

  it("rejects a postcode shorter than 5 characters", () => {
    const errors = validateChildForm({ ...validChild, postcode: "AB1" });
    expect(errors.postcode).toMatch(/at least 5 characters/);
  });

  it("allows optional fields to stay blank", () => {
    const errors = validateChildForm({ ...validChild, middle_name: "", address2: "", address3: "", medical_condition: "" });
    expect(errors).toEqual({});
  });
});
