import { describe, it, expect } from "vitest";
import { validatePassword } from "../../utils/password";

describe("validatePassword", () => {
  it("rejects passwords under 8 characters", () => {
    expect(validatePassword("Ab1")).toMatch(/at least 8 characters/);
  });

  it("rejects passwords with no digit", () => {
    expect(validatePassword("alllettersnodigits")).toMatch(/letter and one number/);
  });

  it("rejects passwords with no letter", () => {
    expect(validatePassword("12345678")).toMatch(/letter and one number/);
  });

  it("accepts a password with 8+ characters, a letter, and a number", () => {
    expect(validatePassword("Passw0rd!")).toBeNull();
  });
});
