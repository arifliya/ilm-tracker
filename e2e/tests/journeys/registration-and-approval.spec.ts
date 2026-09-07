import { test, expect, Page } from "@playwright/test";
import { loginAs, visitLoginPage, submitLoginForm } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";
import {
  goToParentRegistrationTab,
  fillParentRegistrationForm,
  submitParentRegistration,
  expectRegistrationSubmitted,
  ParentRegistrationInput
} from "../../helpers/registration";

const baseRegistration: ParentRegistrationInput = {
  schoolCode: "ILM2026",
  firstName: "Priya",
  surname: "Okafor",
  relationship: "Parent - Mother",
  contactNumber: "07700900999",
  email: "priya.okafor.e2e@example.com",
  password: "Passw0rd!",
  student: {
    firstName: "Kemi",
    surname: "Okafor",
    gender: "Female",
    classCode: "7A",
    dateOfBirth: "2014-03-12",
    address1: "1 Test Street",
    city: "Leicester",
    postcode: "LE1 1AA"
  }
};

/** Finds the pending-approval row for `email` and returns the username
 * shown in it — self-registered users get a server-generated username,
 * so this is the only way to know what to log in with afterward. */
async function readPendingUsername(page: Page, email: string): Promise<string> {
  const row = page.getByRole("row", { name: new RegExp(email) });
  return (await row.locator("td").first().innerText()).trim();
}

test.describe("Journey: registration and approval", () => {
  test("a parent registers a child, an owner approves them, and the new parent can log in", async ({
    page
  }) => {
    await test.step("Given a visitor on the registration page", async () => {
      await goToParentRegistrationTab(page);
    });

    await test.step("When they submit a valid parent + child registration", async () => {
      await fillParentRegistrationForm(page, baseRegistration);
      await submitParentRegistration(page);
    });

    await test.step("Then they see the pending-approval confirmation", async () => {
      await expectRegistrationSubmitted(page);
    });

    let newUsername = "";

    await test.step("When an owner reviews and approves the pending registration", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Approvals");
      newUsername = await readPendingUsername(page, baseRegistration.email);
      const row = page.getByRole("row", { name: new RegExp(baseRegistration.email) });
      await row.getByRole("combobox").selectOption("parent");
      await row.getByRole("button", { name: "Approve" }).click();
    });

    await test.step("Then the new parent can log in and see their child", async () => {
      await page.getByRole("button", { name: "Logout" }).click();
      await visitLoginPage(page);
      await submitLoginForm(page, newUsername, baseRegistration.password);
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(
        page.getByRole("heading", { name: "Welcome to your Parent Dashboard" })
      ).toBeVisible();
      await clickNavItem(page, "Your Children");
      await expect(
        page.getByRole("row", { name: new RegExp(baseRegistration.student.firstName) })
      ).toBeVisible();
    });
  });

  test("registering with an email that's already in use is rejected", async ({
    page
  }) => {
    await test.step("Given a visitor on the registration page", async () => {
      await goToParentRegistrationTab(page);
    });

    await test.step("When they submit a registration using an email already on the system", async () => {
      await fillParentRegistrationForm(page, {
        ...baseRegistration,
        email: "aisha.khan@example.com" // parent1's seeded email
      });
      await submitParentRegistration(page);
    });

    await test.step("Then they see a duplicate-email error and stay on the form", async () => {
      await expect(
        page.getByText("An account with this email already exists.")
      ).toBeVisible();
    });
  });

  test("submitting without a first name is rejected client-side", async ({
    page
  }) => {
    await test.step("Given a visitor on the registration page", async () => {
      await goToParentRegistrationTab(page);
    });

    await test.step("When they submit the form with no first name", async () => {
      await fillParentRegistrationForm(page, {
        ...baseRegistration,
        firstName: "",
        email: "no-first-name.e2e@example.com"
      });
      await submitParentRegistration(page);
    });

    await test.step("Then they see a field-level validation error", async () => {
      await expect(page.getByText("First name is required")).toBeVisible();
    });
  });

  test("an owner can reject a pending registration, and the rejected user can't log in", async ({
    page
  }) => {
    const rejected: ParentRegistrationInput = {
      ...baseRegistration,
      firstName: "Samir",
      surname: "Patel",
      email: "samir.patel.e2e@example.com"
    };

    await test.step("Given a submitted parent registration", async () => {
      await goToParentRegistrationTab(page);
      await fillParentRegistrationForm(page, rejected);
      await submitParentRegistration(page);
      await expectRegistrationSubmitted(page);
    });

    let rejectedUsername = "";

    await test.step("When an owner rejects the pending registration", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Approvals");
      rejectedUsername = await readPendingUsername(page, rejected.email);
      const row = page.getByRole("row", { name: new RegExp(rejected.email) });
      await row.getByRole("button", { name: "Reject" }).click();
      await page.getByRole("button", { name: "Confirm" }).click();
    });

    await test.step("Then the rejected user can no longer log in", async () => {
      await page.getByRole("button", { name: "Logout" }).click();
      await visitLoginPage(page);
      await submitLoginForm(page, rejectedUsername, rejected.password);
      await expect(page.getByText("Invalid credentials")).toBeVisible();
    });
  });
});
