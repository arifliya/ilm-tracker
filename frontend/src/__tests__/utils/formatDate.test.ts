import { describe, it, expect } from "vitest";
import { formatDate } from "../../utils/formatDate";

describe("formatDate", () => {
  it("returns an em dash for an empty string", () => {
    expect(formatDate("")).toBe("—");
  });

  it("returns the raw string for an unparseable date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("formats a valid ISO date as en-GB (dd/mm/yyyy)", () => {
    expect(formatDate("2026-01-05")).toBe("05/01/2026");
  });
});
