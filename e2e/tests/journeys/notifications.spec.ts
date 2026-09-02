import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";
import { fieldByLabel } from "../../helpers/forms";

test.describe("Journey: notifications", () => {
  test("an owner sends a notification and a parent recipient sees it", async ({
    page
  }) => {
    await test.step("Given an owner on Notifications", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Notifications");
    });

    await test.step("When they send a notification to parents", async () => {
      await fieldByLabel(page, "Send To").selectOption("parent");
      await page.getByPlaceholder("Enter a title").fill("E2E School Notice");
      await page
        .getByPlaceholder("Enter the notification message")
        .fill("E2E: reminder about the upcoming inset day.");
      await page.getByRole("button", { name: "Send Notification" }).click();
    });

    await test.step("Then it confirms how many recipients got it", async () => {
      await expect(page.getByText(/Notification sent to \d+ recipient/)).toBeVisible();
    });

    await test.step("When a parent recipient checks their notifications", async () => {
      await logout(page);
      await loginAs(page, "parent1");
      await clickNavItem(page, "Notifications");
    });

    await test.step("Then they see the notification and can open it without error", async () => {
      await expect(page.getByText("E2E School Notice")).toBeVisible();
      await expect(
        page.getByText("E2E: reminder about the upcoming inset day.")
      ).toBeVisible();
      await page.getByText("E2E School Notice").click();
      await expect(page.getByText("Failed", { exact: false })).toHaveCount(0);
    });
  });

  test("sending a notification without picking an audience is blocked", async ({
    page
  }) => {
    await test.step("Given an owner on Notifications", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Notifications");
    });

    await test.step("When they submit without choosing an audience", async () => {
      await page.getByPlaceholder("Enter a title").fill("E2E No Audience");
      await page
        .getByPlaceholder("Enter the notification message")
        .fill("E2E: this should not send.");
      await page.getByRole("button", { name: "Send Notification" }).click();
    });

    await test.step("Then the browser blocks submission on the required field", async () => {
      const audienceSelect = fieldByLabel(page, "Send To");
      expect(
        await audienceSelect.evaluate(el => (el as HTMLSelectElement).validity.valid)
      ).toBe(false);
      await expect(page.getByText(/Notification sent to/)).toHaveCount(0);
    });
  });
});
