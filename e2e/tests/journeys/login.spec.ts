import { test, expect } from "@playwright/test";
import {
  visitLoginPage,
  submitLoginForm,
  expectRedirectedToDashboard,
  expectLoginError,
  logout,
  loginAs,
  SEED_PASSWORD
} from "../../helpers/auth";

test.describe("Journey: logging in", () => {
  test("a user with valid credentials reaches their dashboard", async ({
    page
  }) => {
    await test.step("Given a seeded user account (owner1)", async () => {
      await visitLoginPage(page);
    });

    await test.step("When they submit their correct username and password", async () => {
      await submitLoginForm(page, "owner1", SEED_PASSWORD);
    });

    await test.step("Then they are redirected to their dashboard", async () => {
      await expectRedirectedToDashboard(page);
    });
  });

  test("a user with an incorrect password is rejected", async ({ page }) => {
    await test.step("Given a seeded user account (owner1)", async () => {
      await visitLoginPage(page);
    });

    await test.step("When they submit the correct username but the wrong password", async () => {
      await submitLoginForm(page, "owner1", "wrong-password");
    });

    await test.step("Then they see an invalid-credentials error and stay on the login page", async () => {
      await expectLoginError(page, "Invalid credentials");
    });
  });

  test("logging out clears the session", async ({ page }) => {
    await test.step("Given a logged-in user", async () => {
      await loginAs(page, "owner1");
    });

    await test.step("When they log out", async () => {
      await logout(page);
    });

    await test.step("Then their session is cleared and the dashboard is no longer reachable", async () => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
