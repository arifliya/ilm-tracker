jest.mock("../../config/db");
jest.mock("../../utils/featureFlags", () => ({
  resetExpiredFeatureFlags: jest.fn().mockResolvedValue(undefined)
}));

import app from "../../app";
import { rows } from "../helpers/db";
import { request } from "../helpers/request";
import { authCookie } from "../helpers/auth";

const { mockDb } = jest.requireMock<typeof import("../../config/__mocks__/db")>("../../config/db");
const mockQuery = mockDb.query as jest.Mock;

describe("GET /api/features", () => {
  it("401s without a cookie", async () => {
    const res = await request(app).get("/api/features");
    expect(res.status).toBe(401);
  });

  it("returns a key->boolean map, coalescing override over default", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        { feature_key: "notifications", enabled: 1 },
        { feature_key: "attendance_report", enabled: 0 }
      ])
    );

    const teacherCookie = await authCookie({ userId: 1, role: "teacher", schoolId: 10 });
    const res = await request(app).get("/api/features").set("Cookie", teacherCookie);

    expect(res.status).toBe(200);
    expect(res.body.flags).toEqual({ notifications: true, attendance_report: false });
  });

  it("500s when the query throws", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));
    const teacherCookie = await authCookie({ userId: 1, role: "teacher", schoolId: 10 });
    const res = await request(app).get("/api/features").set("Cookie", teacherCookie);
    expect(res.status).toBe(500);
  });
});
