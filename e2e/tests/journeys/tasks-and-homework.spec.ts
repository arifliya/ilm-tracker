import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";
import { fieldByLabel } from "../../helpers/forms";

test.describe("Journey: tasks and homework", () => {
  test("a teacher sets a task, a parent sees it, and the teacher can delete it", async ({
    page
  }) => {
    await test.step("Given a teacher on Tasks", async () => {
      await loginAs(page, "teacher1");
      await clickNavItem(page, "Tasks");
    });

    await test.step("When they create a task for their class", async () => {
      await fieldByLabel(page, "Class").selectOption({ label: "Year 7A" });
      await page.getByPlaceholder("Task title").fill("E2E Homework Task");
      await fieldByLabel(page, "Due Date").fill("2026-09-30");
      await page.getByRole("button", { name: "Create Task" }).click();
    });

    await test.step("Then the task is created", async () => {
      await expect(page.getByText("Task created successfully.")).toBeVisible();
      await expect(
        page.getByRole("row", { name: /E2E Homework Task/ })
      ).toBeVisible();
    });

    await test.step("When a parent of a student in that class checks Tasks & Homework", async () => {
      await logout(page);
      await loginAs(page, "parent1");
      await clickNavItem(page, "Tasks & Homework");
    });

    await test.step("Then they see the task", async () => {
      // .first(): parent1 has more than one child in Year 7A (another
      // journey adds a second), so a class-wide task lists once per child.
      await expect(
        page.getByRole("row", { name: /E2E Homework Task/ }).first()
      ).toBeVisible();
    });

    await test.step("When the teacher deletes the task", async () => {
      await logout(page);
      await loginAs(page, "teacher1");
      await clickNavItem(page, "Tasks");
      const row = page.getByRole("row", { name: /E2E Homework Task/ });
      await row.getByRole("button", { name: "Delete" }).click();
      await page.getByRole("button", { name: "Confirm" }).click();
    });

    await test.step("Then it's removed from the task list", async () => {
      await expect(
        page.getByRole("row", { name: /E2E Homework Task/ })
      ).toHaveCount(0);
    });
  });

  test("submitting the task form without a due date is blocked", async ({
    page
  }) => {
    await test.step("Given a teacher on Tasks", async () => {
      await loginAs(page, "teacher1");
      await clickNavItem(page, "Tasks");
    });

    await test.step("When they submit without a due date", async () => {
      await fieldByLabel(page, "Class").selectOption({ label: "Year 7A" });
      await page.getByPlaceholder("Task title").fill("E2E Missing Due Date");
      await page.getByRole("button", { name: "Create Task" }).click();
    });

    await test.step("Then the browser blocks submission on the required field", async () => {
      const dueDateInput = fieldByLabel(page, "Due Date");
      expect(await dueDateInput.evaluate(el => (el as HTMLInputElement).validity.valid)).toBe(
        false
      );
      await expect(
        page.getByRole("row", { name: /E2E Missing Due Date/ })
      ).toHaveCount(0);
    });
  });
});
