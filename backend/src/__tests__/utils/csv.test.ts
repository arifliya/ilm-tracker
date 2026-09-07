import { escapeCsvField, toCsv } from "../../utils/csv";

describe("escapeCsvField", () => {
  it("returns an empty string for null/undefined", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("stringifies plain values unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField(42)).toBe("42");
    expect(escapeCsvField(true)).toBe("true");
  });

  it("quotes values containing a comma", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
  });

  it("quotes values containing a newline", () => {
    expect(escapeCsvField("a\nb")).toBe('"a\nb"');
  });

  it("quotes and doubles internal quotes", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("does not quote a value with none of the special characters", () => {
    expect(escapeCsvField("plain value")).toBe("plain value");
  });
});

describe("toCsv", () => {
  it("joins header and rows with CRLF", () => {
    const csv = toCsv(["A", "B"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("A,B\r\n1,2\r\n3,4");
  });

  it("handles zero rows (header only)", () => {
    const csv = toCsv(["A", "B"], []);
    expect(csv).toBe("A,B");
  });

  it("escapes fields within rows", () => {
    const csv = toCsv(["Name"], [["Doe, John"]]);
    expect(csv).toBe('Name\r\n"Doe, John"');
  });

  it("escapes null/undefined cells as empty strings", () => {
    const csv = toCsv(["A", "B"], [[null, undefined]]);
    expect(csv).toBe("A,B\r\n,");
  });
});
