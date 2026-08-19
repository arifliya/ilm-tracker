jest.mock("../../config/db");
jest.mock("../../utils/featureFlags", () => ({
  isFeatureEnabled: jest.fn()
}));

import request from "supertest";
import { app } from "../../app";
import { pool } from "../../config/db";
import { rows, mockConnection } from "../helpers/db";
import { authCookie } from "../helpers/auth";
import { isFeatureEnabled } from "../../utils/featureFlags";

const mockQuery = pool.query as jest.Mock;
const mockGetConnection = pool.getConnection as jest.Mock;
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock;

const adminCookie = authCookie({ userId: 1, role: "admin", schoolId: 10 });
const sysAdminCookie = authCookie({ userId: 2, role: "system_admin", schoolId: null });
const parentCookie = authCookie({ userId: 3, role: "parent", schoolId: 10 });

describe("POST /api/notifications", () => {
  it("403s for a role outside SENDERS", async () => {
    const res = await request(app)
      .post("/api/notifications")
      .set("Cookie", parentCookie)
      .send({ audience: "parent", title: "Hi", message: "Hello" });
    expect(res.status).toBe(403);
  });

  it("400s on an invalid audience", async () => {
    const res = await request(app)
      .post("/api/notifications")
      .set("Cookie", adminCookie)
      .send({ audience: "everyone", title: "Hi", message: "Hello" });
    expect(res.status).toBe(400);
  });

  it("400s when title is missing", async () => {
    const res = await request(app)
      .post("/api/notifications")
      .set("Cookie", adminCookie)
      .send({ audience: "parent", message: "Hello" });
    expect(res.status).toBe(400);
  });

  it("400s when message is missing", async () => {
    const res = await request(app)
      .post("/api/notifications")
      .set("Cookie", adminCookie)
      .send({ audience: "parent", title: "Hi" });
    expect(res.status).toBe(400);
  });

  it("400s for system_admin when school_id is not provided", async () => {
    const res = await request(app)
      .post("/api/notifications")
      .set("Cookie", sysAdminCookie)
      .send({ audience: "parent", title: "Hi", message: "Hello" });
    expect(res.status).toBe(400);
  });

  it("403s when the notifications feature is disabled for the school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app)
      .post("/api/notifications")
      .set("Cookie", adminCookie)
      .send({ audience: "parent", title: "Hi", message: "Hello" });
    expect(res.status).toBe(403);
  });

  it("sends to all resolved recipients and reports the count", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 5 }, { id: 6 }])); // recipients

    const conn = mockConnection();
    mockGetConnection.mockResolvedValueOnce(conn);
    conn.query
      .mockResolvedValueOnce([{ insertId: 900 }]) // insert notification
      .mockResolvedValueOnce([{}]); // insert recipients

    const res = await request(app)
      .post("/api/notifications")
      .set("Cookie", adminCookie)
      .send({ audience: "parent", title: "Hi", message: "Hello" });

    expect(res.status).toBe(201);
    expect(res.body.recipientCount).toBe(2);
    expect(conn.commit).toHaveBeenCalled();
  });

  it("commits without a recipient insert when there are zero recipients", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([])); // no recipients

    const conn = mockConnection();
    mockGetConnection.mockResolvedValueOnce(conn);
    conn.query.mockResolvedValueOnce([{ insertId: 900 }]);

    const res = await request(app)
      .post("/api/notifications")
      .set("Cookie", adminCookie)
      .send({ audience: "staff", title: "Hi", message: "Hello" });

    expect(res.status).toBe(201);
    expect(res.body.recipientCount).toBe(0);
    expect(conn.query).toHaveBeenCalledTimes(1);
  });

  it("rolls back and 500s when the transaction throws", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([]));

    const conn = mockConnection();
    mockGetConnection.mockResolvedValueOnce(conn);
    conn.query.mockRejectedValueOnce(new Error("insert failed"));

    const res = await request(app)
      .post("/api/notifications")
      .set("Cookie", adminCookie)
      .send({ audience: "staff", title: "Hi", message: "Hello" });

    expect(res.status).toBe(500);
    expect(conn.rollback).toHaveBeenCalled();
  });
});

describe("GET /api/notifications/sent", () => {
  it("scopes to the requester's school for admin", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/notifications/sent").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).toMatch(/WHERE n.school_id = \?/);
  });

  it("does not scope for system_admin", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/notifications/sent").set("Cookie", sysAdminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual([]);
  });
});

describe("GET /api/notifications", () => {
  it("returns an empty array when the feature is disabled", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).get("/api/notifications").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns the caller's notifications", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, title: "Hi" }]));
    const res = await request(app).get("/api/notifications").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("POST /api/notifications/:id/read", () => {
  it("403s when the feature is disabled", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).post("/api/notifications/1/read").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("404s when the notification does not belong to the caller", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows({ affectedRows: 0 }))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app).post("/api/notifications/1/read").set("Cookie", parentCookie);
    expect(res.status).toBe(404);
  });

  it("200s (no-op) when it was already marked read", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows({ affectedRows: 0 }))
      .mockResolvedValueOnce(rows([{ x: 1 }]));

    const res = await request(app).post("/api/notifications/1/read").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
  });

  it("marks the notification as read", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows({ affectedRows: 1 }));

    const res = await request(app).post("/api/notifications/1/read").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
  });
});
