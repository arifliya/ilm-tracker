import { Page, expect } from "@playwright/test";

/** Every seeded account in mysql/seed.sql shares this dev password. */
export const SEED_PASSWORD = "Passw0rd!";

export async function visitLoginPage(page: Page): Promise<void> {
  await page.goto("/login");
}

export async function submitLoginForm(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.getByTestId("username-input").fill(username);
  await page.getByTestId("password-input").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
}

export async function expectRedirectedToDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function expectLoginError(
  page: Page,
  message: string
): Promise<void> {
  await expect(page.getByText(message)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Convenience for journeys where logging in is setup, not the thing under
 * test — see tests/journeys/login.spec.ts for the login journey itself,
 * expressed as its own Given/When/Then steps.
 */
export async function loginAs(
  page: Page,
  username: string,
  password: string = SEED_PASSWORD
): Promise<void> {
  await visitLoginPage(page);
  await submitLoginForm(page, username, password);
  await expectRedirectedToDashboard(page);
}
