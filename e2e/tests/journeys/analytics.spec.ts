import { test, expect } from "@playwright/test";
import { loginAs } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";

// Depends on the `analytics_dashboard` flag being on for ILM2026 (seeded
// that way specifically for this suite) — see e2e/README.md's @flagged
// convention.
test.describe("Journey: analytics", { tag: "@flagged" }, () => {
  test("an owner views the analytics dashboard", async ({ page }) => {
    await test.step("Given an owner on Analytics", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Analytics");
    });

    await test.step("Then the attendance trend and per-class charts render without error", async () => {
      await expect(
        page.getByRole("heading", { name: "Attendance Trend" })
      ).toBeVisible();
      await expect(page.getByText("Failed to load analytics")).toHaveCount(0);
    });
  });
});
