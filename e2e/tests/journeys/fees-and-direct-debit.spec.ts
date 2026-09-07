import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";
import { fieldByLabel } from "../../helpers/forms";

async function createFeePeriod(
  page: import("@playwright/test").Page,
  name: string
): Promise<void> {
  await page.getByPlaceholder("e.g. September 2026").fill(name);
  await fieldByLabel(page, "Start date").fill("2026-09-01");
  await fieldByLabel(page, "End date").fill("2026-12-15");
  await page.getByRole("button", { name: "Create Period" }).click();
  await expect(page.getByText("Fee period created.")).toBeVisible();
}

// These journeys depend on the `fees`/`direct_debit` flags being on for
// ILM2026 (seeded that way in mysql/seed.sql specifically for this suite)
// — see e2e/README.md's @flagged convention.
test.describe("Journey: fees (enabled school)", { tag: "@flagged" }, () => {
  test("an admin applies a fee by class and a treasurer marks it paid", async ({
    page
  }) => {
    // Runs before the direct-debit test below in this same file — Adam
    // Khan's parent (parent1) must not have an active mandate yet, or
    // this fee would be auto-submitted for collection instead of landing
    // as a plain "unpaid" fee.
    await test.step("Given an admin on Fee Tracking with a new fee period", async () => {
      await loginAs(page, "admin1");
      await clickNavItem(page, "Fee Tracking");
      await createFeePeriod(page, "E2E Autumn Fees");
    });

    await test.step("When they apply a fee to Year 7A", async () => {
      await fieldByLabel(page, "Year 7A (£)").fill("50");
      await page.getByRole("button", { name: "Apply Fees" }).click();
    });

    await test.step("Then the fee is applied", async () => {
      await expect(
        page.getByText("Fees applied for the given classes.")
      ).toBeVisible();
    });

    await test.step("When a treasurer marks Adam Khan's fee as paid", async () => {
      await logout(page);
      await loginAs(page, "treasurer1");
      const row = page.getByRole("row", { name: /Adam Khan/ });
      await row.getByRole("button", { name: "Mark as Paid" }).click();
    });

    await test.step("Then the fee shows as paid", async () => {
      const row = page.getByRole("row", { name: /Adam Khan/ });
      await expect(row.getByText("Paid", { exact: true })).toBeVisible();
    });
  });

  test("applying fees with no class amount entered is rejected", async ({
    page
  }) => {
    await test.step("Given an admin on Fee Tracking with a new fee period", async () => {
      await loginAs(page, "admin1");
      await clickNavItem(page, "Fee Tracking");
      await createFeePeriod(page, "E2E Empty Fees");
    });

    await test.step("When they submit with every class amount left blank", async () => {
      await page.getByRole("button", { name: "Apply Fees" }).click();
    });

    await test.step("Then it's rejected", async () => {
      await expect(
        page.getByText("Enter an amount for at least one class.")
      ).toBeVisible();
    });
  });

  test("a parent sets up direct debit and can cancel it", async ({
    page
  }) => {
    await test.step("Given a parent on Direct Debit", async () => {
      await loginAs(page, "parent1");
      await clickNavItem(page, "Direct Debit");
      await expect(page.getByText("Not set up")).toBeVisible();
    });

    await test.step("When they set it up", async () => {
      await page.getByRole("button", { name: "Set Up Direct Debit" }).click();
    });

    await test.step("Then it's active", async () => {
      await expect(
        page.getByText("Direct debit set up. Fees generated from now on will be collected automatically.")
      ).toBeVisible();
      await expect(page.getByText("Active", { exact: true })).toBeVisible();
    });

    await test.step("When they cancel it", async () => {
      await page.getByRole("button", { name: "Cancel Direct Debit" }).click();
    });

    await test.step("Then it's cancelled", async () => {
      await expect(
        page.getByText("Direct debit cancelled. Future fees will go back to manual payment.")
      ).toBeVisible();
      await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    });
  });
});

// GRN2026 has every flag off by default (no seed overrides) — used here
// specifically to cover the disabled-feature paths without any setup.
test.describe("Journey: fees (disabled school)", () => {
  test("a treasurer at a school without fee tracking sees the disabled message", async ({
    page
  }) => {
    await test.step("Given a treasurer at a school where fees isn't enabled (treasurer2, GRN2026)", async () => {
      await loginAs(page, "treasurer2");
    });

    await test.step("Then they see the disabled message instead of fee tracking", async () => {
      await expect(
        page.getByText(
          "Fee tracking is not currently enabled for your school. Contact your system admin."
        )
      ).toBeVisible();
    });
  });

  test("a parent at a school without direct debit doesn't see the nav item", async ({
    page
  }) => {
    await test.step("Given a parent at a school where direct debit isn't enabled (helen.turner, GRN2026)", async () => {
      await loginAs(page, "helen.turner");
    });

    await test.step("Then there's no Direct Debit nav item", async () => {
      await expect(page.getByText("Direct Debit", { exact: true })).toHaveCount(0);
    });
  });
});
