import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";
import { fieldByLabel } from "../../helpers/forms";

test.describe("Journey: student notes", () => {
  test("a teacher adds a note and the student's parent can read it", async ({
    page
  }) => {
    await test.step("Given a teacher viewing a student's notes from the register", async () => {
      await loginAs(page, "teacher1");
      await clickNavItem(page, "Attendance");
      await fieldByLabel(page, "Class").selectOption({ label: "Year 7A" });
      const row = page.getByRole("row", { name: /Adam Khan/ });
      await row.getByRole("button", { name: "Notes & Homework" }).click();
    });

    await test.step("When they add a note", async () => {
      await page
        .getByPlaceholder("Add a note about this student...")
        .fill("E2E: settling in well this term.");
      await page.getByRole("button", { name: "Add Note" }).click();
    });

    await test.step("Then the note is saved", async () => {
      await expect(page.getByText("Note added.")).toBeVisible();
      await expect(
        page.getByText("E2E: settling in well this term.")
      ).toBeVisible();
    });

    await test.step("When the student's parent views their notes", async () => {
      await page.getByRole("button", { name: "Close" }).click();
      await logout(page);
      await loginAs(page, "parent1");
      await clickNavItem(page, "Your Children");
      const row = page.getByRole("row", { name: /Adam Khan/ });
      await row.getByRole("button", { name: "Notes" }).click();
    });

    await test.step("Then they can read the teacher's note", async () => {
      await expect(
        page.getByText("E2E: settling in well this term.")
      ).toBeVisible();
    });
  });

  test("submitting an empty note is blocked", async ({ page }) => {
    await test.step("Given a teacher viewing a student's notes from the register", async () => {
      await loginAs(page, "teacher1");
      await clickNavItem(page, "Attendance");
      await fieldByLabel(page, "Class").selectOption({ label: "Year 7A" });
      const row = page.getByRole("row", { name: /Adam Khan/ });
      await row.getByRole("button", { name: "Notes & Homework" }).click();
    });

    await test.step("When they submit with no note text", async () => {
      await page.getByRole("button", { name: "Add Note" }).click();
    });

    await test.step("Then the browser blocks submission on the required field", async () => {
      const noteInput = page.getByPlaceholder("Add a note about this student...");
      expect(await noteInput.evaluate(el => (el as HTMLTextAreaElement).validity.valid)).toBe(
        false
      );
      await expect(page.getByText("Note added.")).toHaveCount(0);
    });
  });
});
