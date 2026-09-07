import { test, expect } from "@playwright/test";
import { loginAs } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";
import { fieldByLabel } from "../../helpers/forms";

async function createClass(
  page: import("@playwright/test").Page,
  name: string,
  code: string
): Promise<void> {
  await page.getByPlaceholder("Enter class name").fill(name);
  await page.getByPlaceholder("e.g. 7A").fill(code);
  await page.getByRole("button", { name: "Create Class" }).click();
}

test.describe("Journey: class and teacher management", () => {
  test("an owner creates a class, assigns a teacher, and assigns a student", async ({
    page
  }) => {
    await test.step("Given an owner on Class Management", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Class Management");
    });

    await test.step("When they create a new class", async () => {
      await createClass(page, "E2E Journey Class", "E2EJ1");
    });

    await test.step("Then the class appears in the classes table", async () => {
      await expect(
        page.getByRole("row", { name: /E2E Journey Class/ }).first()
      ).toBeVisible();
    });

    await test.step("When they assign a teacher to the new class", async () => {
      await clickNavItem(page, "Teacher Management");
      await fieldByLabel(page, "Select Class").selectOption({
        label: "E2E Journey Class"
      });
      await fieldByLabel(page, "Select Teacher").selectOption({
        label: "teacher1"
      });
      await page.getByRole("button", { name: "Assign Teacher" }).click();
    });

    await test.step("Then the teacher is assigned", async () => {
      await expect(
        page.getByText("Teacher assigned to class successfully.")
      ).toBeVisible();
    });

    await test.step("When they assign a student to the new class", async () => {
      await clickNavItem(page, "Class Management");
      await fieldByLabel(page, "Select Class").selectOption({
        label: "E2E Journey Class"
      });
      await fieldByLabel(page, "Select Student").selectOption({
        label: "Adam Khan"
      });
      await page.getByRole("button", { name: "Assign Student" }).click();
    });

    await test.step("Then the student is assigned", async () => {
      await expect(
        page.getByText("Student assigned to class successfully.")
      ).toBeVisible();
    });
  });

  test("creating a class with a code that's already in use is rejected", async ({
    page
  }) => {
    await test.step("Given an owner on Class Management, having already created a class", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Class Management");
      await createClass(page, "E2E Duplicate Source", "E2EDUP");
      await expect(
        page.getByRole("row", { name: /E2E Duplicate Source/ }).first()
      ).toBeVisible();
    });

    await test.step("When they create another class using the same class code", async () => {
      await createClass(page, "E2E Duplicate Copy", "E2EDUP");
    });

    await test.step("Then the duplicate code is rejected", async () => {
      await expect(
        page.getByText("A class with this code already exists for this school")
      ).toBeVisible();
    });
  });
});
