import { describe, it, expect } from "vitest";
import { parseCsv } from "../../utils/parseCsv";

describe("parseCsv", () => {
  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("parses a simple CSV into objects keyed by the header row", () => {
    const result = parseCsv("first_name,surname\nSam,Doe\nZainab,Mahmoud");
    expect(result).toEqual([
      { first_name: "Sam", surname: "Doe" },
      { first_name: "Zainab", surname: "Mahmoud" }
    ]);
  });

  it("handles CRLF line endings", () => {
    const result = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(result).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" }
    ]);
  });

  it("handles a quoted field containing a comma", () => {
    const result = parseCsv('name,address\n"Doe, Sam","1 Road"');
    expect(result).toEqual([{ name: "Doe, Sam", address: "1 Road" }]);
  });

  it("handles a quoted field containing an embedded newline", () => {
    const result = parseCsv('name,note\nSam,"line one\nline two"\nZainab,fine');
    expect(result).toEqual([
      { name: "Sam", note: "line one\nline two" },
      { name: "Zainab", note: "fine" }
    ]);
  });

  it("handles escaped double quotes inside a quoted field", () => {
    const result = parseCsv('name,note\nSam,"she said ""hi"""');
    expect(result).toEqual([{ name: "Sam", note: 'she said "hi"' }]);
  });

  it("trims whitespace around field values", () => {
    const result = parseCsv("a,b\n  1  ,  2  ");
    expect(result).toEqual([{ a: "1", b: "2" }]);
  });

  it("skips fully blank trailing lines", () => {
    const result = parseCsv("a,b\n1,2\n\n");
    expect(result).toEqual([{ a: "1", b: "2" }]);
  });

  it("fills missing trailing columns with an empty string", () => {
    const result = parseCsv("a,b,c\n1,2");
    expect(result).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("returns an empty array when only a header row is present", () => {
    expect(parseCsv("a,b\n")).toEqual([]);
  });
});
