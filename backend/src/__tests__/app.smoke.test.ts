jest.mock("../config/db");
jest.mock("../utils/featureFlags", () => ({
  resetExpiredFeatureFlags: jest.fn().mockResolvedValue(undefined)
}));

import request from "supertest";
import { app } from "../app";
import { pool } from "../config/db";
import { rows } from "./helpers/db";
import { authCookie } from "./helpers/auth";

const mockQuery = pool.query as jest.Mock;

describe("app", () => {
  it("responds on GET /", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "ilm backend running" });
  });
});

describe("GET /healthz", () => {
  it("200s when the DB is reachable", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("503s when the DB query throws", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "error" });
  });
});

// Every route handler is wrapped in asyncHandler, so a rejected promise from
// inside one reaches this middleware via next(err) instead of hanging the
// request — this exercises that path end-to-end through a real route rather
// than just unit-testing the middleware function in isolation.
describe("centralized error handling", () => {
  it("turns an unexpected thrown error into a 500 instead of hanging the request", async () => {
    mockQuery.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .get("/api/features")
      .set("Cookie", authCookie({ userId: 1, role: "admin", schoolId: 10 }));
    expect(res.status).toBe(500);
    expect(res.body.message).toBeTruthy();
  });
});
