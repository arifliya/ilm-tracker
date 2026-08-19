jest.mock("../../config/db");
jest.mock("../../utils/featureFlags", () => ({
  resetExpiredFeatureFlags: jest.fn().mockResolvedValue(undefined)
}));

import request from "supertest";
import { app } from "../../app";
import { pool } from "../../config/db";
import { rows } from "../helpers/db";
import { authCookie } from "../helpers/auth";

const mockQuery = pool.query as jest.Mock;
const teacherCookie = authCookie({ userId: 1, role: "teacher", schoolId: 10 });

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

    const res = await request(app).get("/api/features").set("Cookie", teacherCookie);

    expect(res.status).toBe(200);
    expect(res.body.flags).toEqual({ notifications: true, attendance_report: false });
  });

  it("500s when the query throws", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));
    const res = await request(app).get("/api/features").set("Cookie", teacherCookie);
    expect(res.status).toBe(500);
  });
});
