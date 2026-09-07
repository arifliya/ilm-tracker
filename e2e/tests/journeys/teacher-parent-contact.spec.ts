import { test, expect } from "@playwright/test";
import { loginAs } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";

test.describe("Journey: teacher parent contact info", () => {
  test("a teacher views a student's parent contact info", async ({ page }) => {
    await test.step("Given a teacher on My Classes", async () => {
      await loginAs(page, "teacher1");
      await clickNavItem(page, "My Classes");
    });

    await test.step("When they view Year 7A's register and open a student's parent contact", async () => {
      // Scoped to the 7A row, not .first() — another journey
      // (class-and-teacher-management.spec.ts, which runs earlier
      // alphabetically) gives teacher1 a second class during the suite run.
      await page
        .getByRole("row", { name: /7A/ })
        .getByRole("button", { name: "View Attendance" })
        .click();
      await page
        .getByRole("row", { name: /Adam Khan/ })
        .getByRole("button", { name: "Parent Contact" })
        .click();
    });

    await test.step("Then Aisha Khan's contact details are shown", async () => {
      await expect(page.getByText("Aisha Khan")).toBeVisible();
      await expect(page.getByText("07123456789")).toBeVisible();
      await expect(page.getByText("aisha.khan@example.com")).toBeVisible();
    });
  });
});
