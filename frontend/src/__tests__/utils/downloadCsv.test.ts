import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadCsv } from "../../utils/downloadCsv";
import { api } from "../../api";

vi.mock("../../api", () => ({
  api: { get: vi.fn() }
}));

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

describe("downloadCsv", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(document.body, "appendChild").mockImplementation((node: any) => node);
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    (window.URL.createObjectURL as any) = vi.fn().mockReturnValue("blob:mock-url");
    (window.URL.revokeObjectURL as any) = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads using the filename from Content-Disposition", async () => {
    mockGet.mockResolvedValueOnce({
      headers: { "content-disposition": 'attachment; filename="report_2026.csv"' },
      data: "a,b\n1,2"
    });

    const result = await downloadCsv("/admin/attendance/report", { classId: 1 }, "fallback.csv");

    expect(result).toEqual({ ok: true });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("falls back to the given filename when there is no Content-Disposition header", async () => {
    mockGet.mockResolvedValueOnce({ headers: {}, data: "a,b" });

    const result = await downloadCsv("/admin/attendance/report", {}, "fallback.csv");
    expect(result).toEqual({ ok: true });
  });

  it("recovers the backend's JSON error message from a blob error body", async () => {
    const blob = new Blob([JSON.stringify({ message: "Feature disabled" })], { type: "application/json" });
    mockGet.mockRejectedValueOnce({ response: { data: blob } });

    const result = await downloadCsv("/admin/attendance/report", {}, "fallback.csv");
    expect(result).toEqual({ ok: false, message: "Feature disabled" });
  });

  it("falls back to a generic message when the error has no usable body", async () => {
    mockGet.mockRejectedValueOnce(new Error("network fail"));

    const result = await downloadCsv("/admin/attendance/report", {}, "fallback.csv");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Failed to download attendance report/);
    }
  });
});
