import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";
import { fieldByLabel } from "../../helpers/forms";

async function addTerm(
  page: import("@playwright/test").Page,
  name: string
): Promise<void> {
  await fieldByLabel(page, "Name").fill(name);
  await fieldByLabel(page, "Start Date").fill("2026-09-01");
  await fieldByLabel(page, "End Date").fill("2026-12-15");
  await page.getByRole("button", { name: "Add Term" }).click();
}

test.describe("Journey: report cards", () => {
  test("an admin creates a report card and the parent can view it read-only", async ({
    page
  }) => {
    await test.step("Given an admin on Report Cards with a term set up", async () => {
      await loginAs(page, "admin1");
      await clickNavItem(page, "Report Cards");
      await addTerm(page, "E2E Autumn Term");
    });

    await test.step("When they create a report card for a student", async () => {
      // .first(): the Students table lists one row per class Adam Khan
      // belongs to, not one per student — report cards aren't
      // class-specific, so either row's button opens the same student.
      const row = page.getByRole("row", { name: /Adam Khan/ }).first();
      await row.getByRole("button", { name: "Report Card" }).click();
      await fieldByLabel(page, "Term").selectOption({ label: "E2E Autumn Term" });
      await page.getByPlaceholder("Subject").fill("Maths");
      await page.getByPlaceholder("Grade").fill("A");
      await page.getByRole("button", { name: "Create Report Card" }).click();
    });

    await test.step("Then the report card is created", async () => {
      await expect(page.getByText("Report card created.")).toBeVisible();
    });

    await test.step("When the student's parent views it", async () => {
      await page.getByRole("button", { name: "Close" }).click();
      await logout(page);
      await loginAs(page, "parent1");
      await clickNavItem(page, "Report Cards");
      const row = page.getByRole("row", { name: /Adam Khan/ });
      await row.getByRole("button", { name: "View" }).click();
    });

    await test.step("Then they can read it, read-only", async () => {
      // Scoped to the new term's <li>: the seed data already includes an
      // unrelated "Maths: A" report card for Adam Khan from an earlier
      // term, so an unscoped match would be ambiguous.
      const entry = page.locator("li", { hasText: "E2E Autumn Term" });
      await expect(entry).toBeVisible();
      await expect(entry.getByText("Maths:")).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    });
  });

  test("creating a report card with no subjects is rejected", async ({
    page
  }) => {
    await test.step("Given an admin on Report Cards with a term set up, viewing a student's report card form", async () => {
      await loginAs(page, "admin1");
      await clickNavItem(page, "Report Cards");
      await addTerm(page, "E2E Spring Term");
      // .first(): the Students table lists one row per class Adam Khan
      // belongs to, not one per student — report cards aren't
      // class-specific, so either row's button opens the same student.
      const row = page.getByRole("row", { name: /Adam Khan/ }).first();
      await row.getByRole("button", { name: "Report Card" }).click();
      await fieldByLabel(page, "Term").selectOption({ label: "E2E Spring Term" });
    });

    await test.step("When they submit with no subject filled in", async () => {
      await page.getByRole("button", { name: "Create Report Card" }).click();
    });

    await test.step("Then it's rejected", async () => {
      await expect(
        page.getByText("At least one subject with a name and grade is required.")
      ).toBeVisible();
    });
  });
});
