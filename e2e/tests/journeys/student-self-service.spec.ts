import { test, expect } from "@playwright/test";
import { loginAs } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";

test.describe("Journey: student self-service", () => {
  test("a student views My Classes and My Tasks", async ({ page }) => {
    await test.step("Given a logged-in student", async () => {
      await loginAs(page, "isabellec");
    });

    await test.step("Then they land on My Classes", async () => {
      await expect(
        page.getByRole("heading", { name: "My Classes" })
      ).toBeVisible();
    });

    await test.step("When they switch to My Tasks", async () => {
      await clickNavItem(page, "My Tasks");
    });

    await test.step("Then it loads without error", async () => {
      await expect(
        page.getByRole("heading", { name: "My Tasks" })
      ).toBeVisible();
      await expect(page.getByText("Failed to load dashboard data.")).toHaveCount(0);
    });
  });
});
