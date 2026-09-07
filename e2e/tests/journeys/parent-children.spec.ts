import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";
import { fieldByLabel } from "../../helpers/forms";

test.describe("Journey: parent-child management", () => {
  test("a parent registers a new child", async ({ page }) => {
    await test.step("Given a parent on Add Child", async () => {
      await loginAs(page, "parent1");
      await clickNavItem(page, "Add Child");
    });

    await test.step("When they register a new child", async () => {
      await fieldByLabel(page, "First name *").fill("Ezra");
      await fieldByLabel(page, "Surname *").fill("Okonkwo");
      await fieldByLabel(page, "Gender *").selectOption("Male");
      await fieldByLabel(page, "Class code *").fill("7A");
      await fieldByLabel(page, "Date of birth *").fill("2015-04-02");
      await fieldByLabel(page, "Address line 1 *").fill("2 Test Street");
      await fieldByLabel(page, "City *").fill("Leicester");
      await fieldByLabel(page, "Postcode *").fill("LE1 1AA");
      await page.getByRole("button", { name: "Add Child" }).click();
    });

    await test.step("Then the child is added", async () => {
      await expect(page.getByText("Child added successfully.")).toBeVisible();
      await expect(page.getByRole("row", { name: /Ezra Okonkwo/ })).toBeVisible();
    });
  });

  test("registering a child with too short a postcode is rejected", async ({
    page
  }) => {
    await test.step("Given a parent on Add Child", async () => {
      await loginAs(page, "parent1");
      await clickNavItem(page, "Add Child");
    });

    await test.step("When they submit with a postcode under 5 characters", async () => {
      await fieldByLabel(page, "First name *").fill("Zara");
      await fieldByLabel(page, "Surname *").fill("Bello");
      await fieldByLabel(page, "Gender *").selectOption("Female");
      await fieldByLabel(page, "Class code *").fill("7A");
      await fieldByLabel(page, "Date of birth *").fill("2015-04-02");
      await fieldByLabel(page, "Address line 1 *").fill("2 Test Street");
      await fieldByLabel(page, "City *").fill("Leicester");
      await fieldByLabel(page, "Postcode *").fill("AB1");
      await page.getByRole("button", { name: "Add Child" }).click();
    });

    await test.step("Then it's rejected", async () => {
      await expect(
        page.getByText("Postcode must be at least 5 characters")
      ).toBeVisible();
    });
  });

  test("a parent requests linking to an existing child, and an owner approves it", async ({
    page
  }) => {
    await test.step("Given a parent not yet linked to Adam Khan, on Add Child", async () => {
      await loginAs(page, "laura.bennett");
      await clickNavItem(page, "Add Child");
      await page.getByRole("button", { name: "Link to an existing child" }).click();
    });

    await test.step("When they submit Adam Khan's guardian code", async () => {
      await fieldByLabel(page, "Guardian code").fill("STUD0001");
      await page.getByRole("button", { name: "Submit Request" }).click();
    });

    await test.step("Then the request is pending approval", async () => {
      await expect(
        page.getByText("Request submitted. Pending admin approval.")
      ).toBeVisible();
    });

    await test.step("When an owner approves the guardian request", async () => {
      await logout(page);
      await loginAs(page, "owner1");
      await clickNavItem(page, "Approvals");
      const row = page.getByRole("row", { name: /Laura Bennett/ });
      await row.getByRole("button", { name: "Approve" }).click();
    });

    await test.step("Then it's approved", async () => {
      await expect(page.getByText("Guardian request approved.")).toBeVisible();
    });
  });

  test("submitting an empty guardian code is rejected", async ({ page }) => {
    await test.step("Given a parent on Add Child, on the Link tab", async () => {
      await loginAs(page, "laura.bennett");
      await clickNavItem(page, "Add Child");
      await page.getByRole("button", { name: "Link to an existing child" }).click();
    });

    await test.step("When they submit with no guardian code", async () => {
      await page.getByRole("button", { name: "Submit Request" }).click();
    });

    await test.step("Then it's rejected", async () => {
      await expect(page.getByText("Guardian code is required.")).toBeVisible();
    });
  });
});
