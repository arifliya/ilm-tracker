import { test, expect } from "@playwright/test";
import { loginAs } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";

test.describe("Journey: approvals and roles", () => {
  test("a maintainer adds a new role", async ({ page }) => {
    await test.step("Given a maintainer on Add Role", async () => {
      await loginAs(page, "maintainer1");
      await clickNavItem(page, "Add Role");
    });

    await test.step("When they submit a new role name", async () => {
      await page
        .getByPlaceholder("Enter role name (e.g., librarian)")
        .fill("e2e-test-role");
      await page.getByRole("button", { name: "Add Role" }).click();
    });

    await test.step("Then the role is added", async () => {
      await expect(page.getByText("Role added successfully")).toBeVisible();
      await expect(page.getByText("e2e-test-role")).toBeVisible();
    });
  });

  test("submitting an empty role name is rejected", async ({ page }) => {
    await test.step("Given a maintainer on Add Role", async () => {
      await loginAs(page, "maintainer1");
      await clickNavItem(page, "Add Role");
    });

    await test.step("When they submit with no role name", async () => {
      await page.getByRole("button", { name: "Add Role" }).click();
    });

    await test.step("Then the empty name is rejected", async () => {
      await expect(page.getByText("Role name cannot be empty")).toBeVisible();
    });
  });

  test("an owner approving a pending user without picking a role is rejected", async ({
    page
  }) => {
    await test.step("Given an owner viewing a pending registration (nicole.adeyemi)", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Approvals");
    });

    await test.step("When they click Approve without selecting a role", async () => {
      const row = page.getByRole("row", { name: /nicole.adeyemi/ });
      await row.getByRole("button", { name: "Approve" }).click();
    });

    await test.step("Then they're told to pick a role first", async () => {
      await expect(
        page.getByText("Please select a role before approving.")
      ).toBeVisible();
    });
  });
});
