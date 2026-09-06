jest.mock("../../config/db");

import { rows } from "../helpers/db";
import { isFeatureEnabled, resetExpiredFeatureFlags } from "../../utils/featureFlags";

const { mockDb } = jest.requireMock<typeof import("../../config/__mocks__/db")>("../../config/db");
const mockQuery = mockDb.query as jest.Mock;

describe("resetExpiredFeatureFlags", () => {
  it("does nothing when no flags are expired", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    await resetExpiredFeatureFlags(mockDb as any);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toMatch(/expires_at IS NOT NULL/);
  });

  it("clears overrides and expiry for every expired flag", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }, { id: 2 }])) // SELECT expired
      .mockResolvedValueOnce(rows([])) // DELETE overrides for flag 1
      .mockResolvedValueOnce(rows([])) // DELETE overrides for flag 2
      .mockResolvedValueOnce(rows([])); // UPDATE clear expires_at

    await resetExpiredFeatureFlags(mockDb as any);

    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(mockQuery.mock.calls[1][0]).toMatch(/DELETE FROM school_feature_flags/);
    expect(mockQuery.mock.calls[1][1]).toEqual([1]);
    expect(mockQuery.mock.calls[2][1]).toEqual([2]);
    expect(mockQuery.mock.calls[3][0]).toMatch(/UPDATE feature_flags SET expires_at = NULL/);
  });
});

describe("isFeatureEnabled", () => {
  it("returns false when the flag does not exist", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([])) // resetExpiredFeatureFlags SELECT
      .mockResolvedValueOnce(rows([])); // main lookup, no row

    const result = await isFeatureEnabled(mockDb as any, "unknown_flag", 1);
    expect(result).toBe(false);
  });

  it("uses the school override when one is set (enabled)", async () => {
    mockQuery.mockResolvedValueOnce(rows([])).mockResolvedValueOnce(rows([{ default_enabled: 0, override_enabled: 1 }]));

    const result = await isFeatureEnabled(mockDb as any, "notifications", 5);
    expect(result).toBe(true);
  });

  it("uses the school override when one is set (disabled)", async () => {
    mockQuery.mockResolvedValueOnce(rows([])).mockResolvedValueOnce(rows([{ default_enabled: 1, override_enabled: 0 }]));

    const result = await isFeatureEnabled(mockDb as any, "notifications", 5);
    expect(result).toBe(false);
  });

  it("falls back to default_enabled when there is no override", async () => {
    mockQuery.mockResolvedValueOnce(rows([])).mockResolvedValueOnce(rows([{ default_enabled: 1, override_enabled: null }]));

    const result = await isFeatureEnabled(mockDb as any, "attendance_report", null);
    expect(result).toBe(true);
  });
});
