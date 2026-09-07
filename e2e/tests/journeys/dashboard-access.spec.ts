import { test, expect } from "@playwright/test";
import {
  visitLoginPage,
  submitLoginForm,
  expectRedirectedToDashboard,
  SEED_PASSWORD
} from "../../helpers/auth";

// Roles whose dashboard follows the common "Welcome to your X Dashboard"
// heading pattern. Maintainer, Treasurer, and Student break this pattern
// (see below) and get their own tests instead of being folded into this
// list — see e2e/README.md for why.
const seededUsers: { username: string; role: string }[] = [
  { username: "owner1", role: "Owner" },
  { username: "admin1", role: "Admin" },
  { username: "t.khalid", role: "Teacher" },
  { username: "parent1", role: "Parent" },
  { username: "sysadmin", role: "System Admin" }
];

test.describe("Journey: role-based dashboard access", () => {
  for (const { username, role } of seededUsers) {
    test(`a ${role.toLowerCase()} lands on their own dashboard after logging in`, async ({
      page
    }) => {
      await test.step(`Given a seeded ${role} account (${username})`, async () => {
        await visitLoginPage(page);
      });

      await test.step("When they log in", async () => {
        await submitLoginForm(page, username, SEED_PASSWORD);
        await expectRedirectedToDashboard(page);
      });

      await test.step(`Then they see their ${role} dashboard, not another role's`, async () => {
        await expect(
          page.getByRole("heading", {
            name: `Welcome to your ${role} Dashboard`
          })
        ).toBeVisible();
      });
    });
  }

  test("a maintainer lands on their own dashboard after logging in", async ({
    page
  }) => {
    await test.step("Given a seeded Maintainer account (maintainer1)", async () => {
      await visitLoginPage(page);
    });

    await test.step("When they log in", async () => {
      await submitLoginForm(page, "maintainer1", SEED_PASSWORD);
      await expectRedirectedToDashboard(page);
    });

    await test.step("Then they see the Maintainer dashboard, whose heading does not follow the common pattern", async () => {
      await expect(
        page.getByRole("heading", { name: "Welcome, Maintainer" })
      ).toBeVisible();
    });
  });

  test("a treasurer at a school with fees enabled lands on Fee Tracking", async ({
    page
  }) => {
    await test.step("Given a seeded Treasurer account at a school with the fees flag on (treasurer1, ILM2026)", async () => {
      await visitLoginPage(page);
    });

    await test.step("When they log in", async () => {
      await submitLoginForm(page, "treasurer1", SEED_PASSWORD);
      await expectRedirectedToDashboard(page);
    });

    await test.step("Then they land directly on Fee Tracking — Treasurer has no separate welcome section", async () => {
      await expect(
        page.getByRole("heading", { name: "Fee Tracking" })
      ).toBeVisible();
    });
  });

  test("a student lands on My Classes after logging in", async ({ page }) => {
    await test.step("Given a seeded Student account (isabellec)", async () => {
      await visitLoginPage(page);
    });

    await test.step("When they log in", async () => {
      await submitLoginForm(page, "isabellec", SEED_PASSWORD);
      await expectRedirectedToDashboard(page);
    });

    await test.step("Then they land directly on My Classes — Student has no separate welcome section", async () => {
      await expect(
        page.getByRole("heading", { name: "My Classes" })
      ).toBeVisible();
    });
  });
});
