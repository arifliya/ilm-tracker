import { isOriginAllowed } from "../../config/env";

describe("isOriginAllowed", () => {
  const configured = ["https://ilm-tracker.pages.dev"];

  it("allows an exact match", () => {
    expect(isOriginAllowed(configured, "https://ilm-tracker.pages.dev")).toBe(true);
  });

  it("allows a subdomain of a configured origin (Pages branch-preview aliases)", () => {
    expect(isOriginAllowed(configured, "https://feat-some-branch.ilm-tracker.pages.dev")).toBe(true);
    expect(isOriginAllowed(configured, "https://staging.ilm-tracker.pages.dev")).toBe(true);
  });

  it("rejects an unrelated domain", () => {
    expect(isOriginAllowed(configured, "https://evil.com")).toBe(false);
  });

  it("rejects a domain that merely has the configured host as a suffix without a subdomain boundary", () => {
    // No "." before "ilm-tracker" — not an actual subdomain of it.
    expect(isOriginAllowed(configured, "https://evil-ilm-tracker.pages.dev")).toBe(false);
  });

  it("rejects a lookalike domain with the configured host tacked onto a different suffix", () => {
    expect(isOriginAllowed(configured, "https://ilm-tracker.pages.dev.evil.com")).toBe(false);
  });

  it("requires the protocol to match too", () => {
    expect(isOriginAllowed(configured, "http://ilm-tracker.pages.dev")).toBe(false);
    expect(isOriginAllowed(configured, "http://sub.ilm-tracker.pages.dev")).toBe(false);
  });

  it("rejects a malformed origin instead of throwing", () => {
    expect(isOriginAllowed(configured, "not-a-url")).toBe(false);
    expect(isOriginAllowed(configured, "")).toBe(false);
  });

  it("matches against any of multiple configured origins", () => {
    const multi = ["https://ilm-tracker.pages.dev", "http://localhost:5173"];
    expect(isOriginAllowed(multi, "http://localhost:5173")).toBe(true);
    expect(isOriginAllowed(multi, "https://preview.ilm-tracker.pages.dev")).toBe(true);
    expect(isOriginAllowed(multi, "https://other.com")).toBe(false);
  });
});
