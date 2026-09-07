import { test, expect } from "@playwright/test";
import { loginAs } from "../../helpers/auth";
import { clickNavItem } from "../../helpers/nav";

const CSV_HEADER =
  "student_first_name,student_middle_name,student_surname,student_gender,student_date_of_birth,student_address1,student_address2,student_address3,student_city,student_postcode,student_medical_condition,class_code,parent_first_name,parent_middle_name,parent_surname,parent_relationship_to_student,parent_date_of_birth,parent_address1,parent_address2,parent_address3,parent_city,parent_postcode,parent_medical_condition,parent_contact_number,parent_email";

const CSV_ROW =
  "Kofi,,Mensah,Male,2015-05-01,1 Test Street,,,Leicester,LE1 1AA,,7A,Grace,,Mensah,Parent - Mother,1985-05-01,1 Test Street,,,Leicester,LE1 1AA,,07700900321,e2e.bulk.parent@example.com";

test.describe("Journey: bulk student upload", () => {
  test("an admin downloads the template and uploads a valid CSV", async ({
    page
  }) => {
    await test.step("Given an admin on Import Students", async () => {
      await loginAs(page, "admin1");
      await clickNavItem(page, "Import Students");
    });

    await test.step("When they download the CSV template", async () => {
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download CSV template" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("student_import_template.csv");
    });

    await test.step("When they upload a valid CSV with one row", async () => {
      await page.getByTestId("bulk-upload-file-input").setInputFiles({
        name: "students.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(`${CSV_HEADER}\n${CSV_ROW}\n`)
      });
      await expect(page.getByText("1 row ready to upload.")).toBeVisible();
      await page.getByRole("button", { name: "Upload" }).click();
    });

    await test.step("Then the row is created", async () => {
      await expect(
        page.getByText("1 of 1 rows created successfully.")
      ).toBeVisible();
      await expect(page.getByRole("row", { name: /Created/ })).toBeVisible();
    });
  });

  test("uploading an empty file is rejected", async ({ page }) => {
    await test.step("Given an admin on Import Students", async () => {
      await loginAs(page, "admin1");
      await clickNavItem(page, "Import Students");
    });

    await test.step("When they upload an empty file", async () => {
      await page.getByTestId("bulk-upload-file-input").setInputFiles({
        name: "empty.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("")
      });
    });

    await test.step("Then it's rejected", async () => {
      await expect(
        page.getByText("No data rows found in this file.")
      ).toBeVisible();
    });
  });
});
