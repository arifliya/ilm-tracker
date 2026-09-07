import { Page, expect } from "@playwright/test";
import { fieldByLabel } from "./forms";

export interface ParentRegistrationInput {
  schoolCode: string;
  firstName: string;
  surname: string;
  relationship: string;
  contactNumber: string;
  email: string;
  password: string;
  student: {
    firstName: string;
    surname: string;
    gender: "Male" | "Female";
    classCode: string;
    dateOfBirth: string;
    address1: string;
    city: string;
    postcode: string;
  };
}

export async function goToParentRegistrationTab(page: Page): Promise<void> {
  await page.goto("/register");
  await page.getByRole("button", { name: "Parent", exact: true }).click();
}

/** Fills every field the "student" happy path needs. Leaves a field blank
 * by passing an empty string for it in `input` — used by the error-case
 * tests to trigger a single missing-field validation. */
export async function fillParentRegistrationForm(
  page: Page,
  input: ParentRegistrationInput
): Promise<void> {
  await fieldByLabel(page, "School code *").fill(input.schoolCode);
  await fieldByLabel(page, "First name *").nth(0).fill(input.firstName);
  await fieldByLabel(page, "Surname *").nth(0).fill(input.surname);
  if (input.relationship) {
    await fieldByLabel(page, "Relationship to student *").selectOption(
      input.relationship
    );
  }
  await fieldByLabel(page, "Contact number *").fill(input.contactNumber);
  await fieldByLabel(page, "Email *").fill(input.email);
  await fieldByLabel(page, "Password *").fill(input.password);

  await fieldByLabel(page, "First name *").nth(1).fill(input.student.firstName);
  await fieldByLabel(page, "Surname *").nth(1).fill(input.student.surname);
  if (input.student.gender) {
    await fieldByLabel(page, "Gender *").selectOption(input.student.gender);
  }
  await fieldByLabel(page, "Class code *").fill(input.student.classCode);
  await fieldByLabel(page, "Date of birth *").fill(input.student.dateOfBirth);
  await fieldByLabel(page, "Address line 1 *").fill(input.student.address1);
  await fieldByLabel(page, "City *").fill(input.student.city);
  await fieldByLabel(page, "Postcode *").fill(input.student.postcode);
}

export async function submitParentRegistration(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Submit parent registration" }).click();
}

export async function expectRegistrationSubmitted(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Registration Submitted" })
  ).toBeVisible();
}
