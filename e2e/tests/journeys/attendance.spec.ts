import { test, expect } from "@playwright/test";
import { loginAs } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";
import { fieldByLabel } from "../../helpers/forms";

test.describe("Journey: attendance", () => {
  test("a teacher marks a student present", async ({ page }) => {
    await test.step("Given a teacher on the Attendance register for their class", async () => {
      await loginAs(page, "teacher1");
      await clickNavItem(page, "Attendance");
      await fieldByLabel(page, "Class").selectOption({ label: "Year 7A" });
    });

    await test.step("When they mark a student present", async () => {
      const row = page.getByRole("row", { name: /Adam Khan/ });
      await row.getByRole("button", { name: "Present" }).click();
    });

    await test.step("Then the register confirms it was saved", async () => {
      await expect(
        page.getByText("Attendance marked successfully.")
      ).toBeVisible();
    });
  });

  test("an owner downloads the attendance CSV report", async ({ page }) => {
    await test.step("Given an owner on Attendance Report", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Attendance Report");
    });

    await test.step("When they download the CSV for the default date range", async () => {
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download CSV" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    });
  });

  test("an owner's report request is rejected when the start date is after the end date", async ({
    page
  }) => {
    await test.step("Given an owner on Attendance Report", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Attendance Report");
    });

    await test.step("When they set a start date after the end date", async () => {
      await fieldByLabel(page, "End Date").fill("2026-08-01");
      await fieldByLabel(page, "Start Date").fill("2026-08-20");
      await page.getByRole("button", { name: "Download CSV" }).click();
    });

    await test.step("Then the invalid range is rejected", async () => {
      await expect(
        page.getByText("Start date must be before end date.")
      ).toBeVisible();
    });
  });
});
