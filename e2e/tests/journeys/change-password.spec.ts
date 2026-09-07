import { test, expect } from "@playwright/test";
import { loginAs, SEED_PASSWORD } from "../../helpers/auth";
import { fieldByLabel } from "../../helpers/forms";

// Depends on the `password_management` flag being on for ILM2026 (seeded
// that way specifically for this suite) — see e2e/README.md's @flagged
// convention.
test.describe("Journey: change password", { tag: "@flagged" }, () => {
  test("a user changes their password and stays signed in", async ({
    page
  }) => {
    // e.clarke is used only in this test — changing a password persists
    // for the rest of the suite run, so reusing a widely-shared login
    // (owner1, teacher1, ...) here would break every later journey that
    // logs in with the original seed password.
    await test.step("Given a logged-in user (e.clarke) on Change Password", async () => {
      await loginAs(page, "e.clarke");
      await page.getByRole("button", { name: "Change Password" }).click();
    });

    await test.step("When they submit a valid current and new password", async () => {
      await fieldByLabel(page, "Current password").fill(SEED_PASSWORD);
      await fieldByLabel(page, "New password").fill("E2ENewPassw0rd!");
      await fieldByLabel(page, "Confirm new password").fill("E2ENewPassw0rd!");
      // .last(): the NavBar's own "Change Password" button (which opened
      // this modal) is still in the DOM behind it and shares the same name.
      await page.getByRole("button", { name: "Change Password" }).last().click();
    });

    await test.step("Then it succeeds and they're still signed in", async () => {
      await expect(
        page.getByText(
          "Password changed. You've been kept signed in on this device — any other logged-in session has been signed out."
        )
      ).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test("a mismatched confirmation is rejected", async ({ page }) => {
    await test.step("Given a logged-in user on Change Password", async () => {
      await loginAs(page, "owner1");
      await page.getByRole("button", { name: "Change Password" }).click();
    });

    await test.step("When the new password and confirmation don't match", async () => {
      await fieldByLabel(page, "Current password").fill(SEED_PASSWORD);
      await fieldByLabel(page, "New password").fill("E2EPassword1!");
      await fieldByLabel(page, "Confirm new password").fill("E2EDifferent1!");
      await page.getByRole("button", { name: "Change Password" }).last().click();
    });

    await test.step("Then it's rejected client-side, before any request is sent", async () => {
      await expect(
        page.getByText("New password and confirmation do not match.")
      ).toBeVisible();
    });
  });
});
