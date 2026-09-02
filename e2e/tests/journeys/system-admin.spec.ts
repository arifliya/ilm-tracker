import { test, expect } from "@playwright/test";
import { loginAs } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";

test.describe("Journey: system admin", () => {
  test("sysadmin creates a school", async ({ page }) => {
    await test.step("Given sysadmin on Schools", async () => {
      await loginAs(page, "sysadmin");
      await clickNavItem(page, "Schools");
    });

    await test.step("When they create a new school", async () => {
      await page.getByPlaceholder("School name").fill("E2E Test Academy");
      await page.getByRole("button", { name: "Create School" }).click();
    });

    await test.step("Then it's created with a generated school code", async () => {
      await expect(page.getByText(/School created — code:/)).toBeVisible();
    });
  });

  test("submitting an empty school name is blocked", async ({ page }) => {
    await test.step("Given sysadmin on Schools", async () => {
      await loginAs(page, "sysadmin");
      await clickNavItem(page, "Schools");
    });

    await test.step("When they submit with no name", async () => {
      await page.getByRole("button", { name: "Create School" }).click();
    });

    await test.step("Then the browser blocks submission on the required field", async () => {
      const nameInput = page.getByPlaceholder("School name");
      expect(
        await nameInput.evaluate(el => (el as HTMLInputElement).validity.valid)
      ).toBe(false);
      await expect(page.getByText(/School created — code:/)).toHaveCount(0);
    });
  });

  test("sysadmin creates a feature flag and toggles it on for a school, recorded in the audit log", async ({
    page
  }) => {
    await test.step("Given sysadmin on Feature Toggles", async () => {
      await loginAs(page, "sysadmin");
      await clickNavItem(page, "Feature Toggles");
    });

    await test.step("When they create a new feature flag", async () => {
      await page.getByPlaceholder("e.g. new_attendance_ui").fill("e2e_test_flag");
      await page.getByPlaceholder("e.g. New Attendance UI").fill("E2E Test Flag");
      await page.getByRole("button", { name: "Create Feature" }).click();
    });

    await test.step("Then it's created", async () => {
      await expect(page.getByText("Feature created successfully.")).toBeVisible();
    });

    await test.step("When they enable it for Ilm School", async () => {
      // The per-school override rows are plain nested <div>s (not a real
      // <table>), so filtering by containing text matches every ancestor
      // div too — go to the exact school-name span's immediate parent
      // instead of filtering.
      const flagRow = page.getByRole("row", { name: /e2e_test_flag/ });
      await flagRow
        .getByText("Ilm School", { exact: true })
        .locator("..")
        .getByRole("button", { name: "Enable" })
        .click();
    });

    await test.step("Then it's updated and recorded in the audit log", async () => {
      await expect(page.getByText("School feature access updated.")).toBeVisible();
      await expect(
        page.getByText(/enabled "e2e_test_flag" for Ilm School/)
      ).toBeVisible();
    });
  });

  test("creating a feature flag with an invalid key format is rejected", async ({
    page
  }) => {
    await test.step("Given sysadmin on Feature Toggles", async () => {
      await loginAs(page, "sysadmin");
      await clickNavItem(page, "Feature Toggles");
    });

    await test.step("When they submit a key with uppercase letters and spaces", async () => {
      await page.getByPlaceholder("e.g. new_attendance_ui").fill("Invalid Key!");
      await page.getByPlaceholder("e.g. New Attendance UI").fill("Invalid Flag");
      await page.getByRole("button", { name: "Create Feature" }).click();
    });

    await test.step("Then it's rejected", async () => {
      await expect(
        page.getByText(
          "Feature key must start with a letter and contain only lowercase letters, numbers, or underscores"
        )
      ).toBeVisible();
    });
  });
});
