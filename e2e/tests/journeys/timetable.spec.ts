import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";
import { fieldByLabel } from "../../helpers/forms";

test.describe("Journey: timetable", () => {
  test("an owner sets up a term, event, and class slot, and a parent sees the schedule", async ({
    page
  }) => {
    await test.step("Given an owner on Timetable", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Timetable");
    });

    await test.step("When they add a term", async () => {
      await fieldByLabel(page, "Name").fill("E2E Timetable Term");
      await fieldByLabel(page, "Start Date").fill("2026-09-01");
      await fieldByLabel(page, "End Date").fill("2026-12-15");
      await page.getByRole("button", { name: "Add Term" }).click();
      await expect(page.getByText("Term created successfully.")).toBeVisible();
    });

    await test.step("When they add an event", async () => {
      // Only the event form is on the page at this point (the slot form
      // only renders once a class is picked below), so "Date" is
      // unambiguous here.
      await page.getByPlaceholder("e.g. Parents' Evening").fill("E2E Sports Day");
      await fieldByLabel(page, "Date").fill("2026-09-15");
      await page.getByRole("button", { name: "Add Event" }).click();
      await expect(page.getByText("Event created successfully.")).toBeVisible();
    });

    await test.step("When they add a class schedule slot", async () => {
      await fieldByLabel(page, "Class").selectOption({ label: "Year 7A" });
      // The slot form shares "Date" as a label with the event form above
      // it — .nth(1) is the slot's, once both are on the page.
      await fieldByLabel(page, "Date").nth(1).fill("2026-09-10");
      await fieldByLabel(page, "Start").fill("09:00");
      await fieldByLabel(page, "End").fill("10:00");
      await page.getByRole("button", { name: "Add Slot" }).click();
      await expect(page.getByText("Timetable slot created.")).toBeVisible();
    });

    await test.step("Then a parent of a student in that class sees it on their schedule", async () => {
      await logout(page);
      await loginAs(page, "parent1");
      await page.getByRole("button", { name: "▶ View Schedule" }).click();
      // Matched by the slot's own date, not "Year 7A" — the seed data
      // already has other 7A slots on other dates. .first(): parent1 can
      // have more than one child in 7A (another journey adds a second),
      // so the same slot lists once per child.
      await expect(
        page.getByRole("row", { name: /10\/09\/2026/ }).first()
      ).toBeVisible();
    });
  });

  test("an event with an end time before its start time is rejected", async ({
    page
  }) => {
    await test.step("Given an owner on Timetable", async () => {
      await loginAs(page, "owner1");
      await clickNavItem(page, "Timetable");
    });

    await test.step("When they submit an event with the end time before the start time", async () => {
      await page.getByPlaceholder("e.g. Parents' Evening").fill("E2E Bad Event");
      await fieldByLabel(page, "Date").fill("2026-09-15");
      await fieldByLabel(page, "Start (optional)").fill("14:00");
      await fieldByLabel(page, "End (optional)").fill("13:00");
      await page.getByRole("button", { name: "Add Event" }).click();
    });

    await test.step("Then it's rejected", async () => {
      await expect(
        page.getByText("end_time must be after start_time")
      ).toBeVisible();
    });
  });
});
