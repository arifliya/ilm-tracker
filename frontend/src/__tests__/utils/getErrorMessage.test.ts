import { describe, it, expect } from "vitest";
import { getErrorMessage } from "../../utils/getErrorMessage";

describe("getErrorMessage", () => {
  it("prefers the server's message when present", () => {
    const err = { response: { data: { message: "Invalid credentials" } } };
    expect(getErrorMessage(err, "fallback")).toBe("Invalid credentials");
  });

  it("reports a timeout distinctly", () => {
    const err = { code: "ECONNABORTED" };
    expect(getErrorMessage(err, "fallback")).toMatch(/timed out/);
  });

  it("reports an unreachable server when a request was made but no response arrived", () => {
    const err = { request: {}, response: undefined };
    expect(getErrorMessage(err, "fallback")).toMatch(/Unable to reach the server/);
  });

  it("falls back to the provided message when nothing else matches", () => {
    expect(getErrorMessage({}, "Something went wrong")).toBe("Something went wrong");
    expect(getErrorMessage(new Error("boom"), "Something went wrong")).toBe("Something went wrong");
    expect(getErrorMessage(null, "Something went wrong")).toBe("Something went wrong");
  });
});
