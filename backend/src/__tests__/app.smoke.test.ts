jest.mock("../config/db");
jest.mock("../utils/featureFlags", () => ({
  resetExpiredFeatureFlags: jest.fn().mockResolvedValue(undefined)
}));

import app from "../app";
import { rows } from "./helpers/db";
import { request } from "./helpers/request";
import { authCookie } from "./helpers/auth";

// jest.mock("../config/db") substitutes config/__mocks__/db.ts wherever
// "../config/db" is imported (e.g. from app.ts) — but that substitution is
// keyed to the *specifier* "../config/db", not to __mocks__/db.ts's own
// file path. A test file that imported __mocks__/db.ts directly would get
// a second, different module instance with its own separate jest.fn()s.
// jest.requireMock loads the mock through the same substitution app.ts
// sees, so this is guaranteed to be the identical mockDb instance.
const { mockDb } = jest.requireMock<typeof import("../config/__mocks__/db")>("../config/db");
const mockQuery = mockDb.query as jest.Mock;

describe("app", () => {
  it("responds on GET /", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "ilm backend running" });
  });
});

// testEnv.CORS_ORIGIN is "http://localhost:5173" — exercised end-to-end
// through the real cors() middleware here, rather than just unit-testing
// isOriginAllowed in isolation, to confirm the callback is actually wired
// up correctly (a plain string[] passed to Hono's `origin` option would
// only ever exact-match and never reach this file's own logic at all).
describe("CORS", () => {
  it("echoes back an allowed origin", async () => {
    const res = await request(app).get("/").set("Origin", "http://localhost:5173");
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("echoes back a subdomain of an allowed origin (Pages branch-preview alias)", async () => {
    const res = await request(app).get("/").set("Origin", "http://preview.localhost:5173");
    expect(res.headers.get("access-control-allow-origin")).toBe("http://preview.localhost:5173");
  });

  it("does not set the header for an unrelated origin", async () => {
    const res = await request(app).get("/").set("Origin", "https://evil.com");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("CSRF content-type gate", () => {
  it("415s a mutating request with a form-encoded content type", async () => {
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/x-www-form-urlencoded");
    expect(res.status).toBe(415);
  });

  it("415s a mutating request with a multipart content type", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "multipart/form-data; boundary=----x");
    expect(res.status).toBe(415);
  });

  it("415s a mutating request with a text/plain content type", async () => {
    const res = await request(app).post("/api/auth/login").set("Content-Type", "text/plain");
    expect(res.status).toBe(415);
  });

  it("does not gate GET requests", async () => {
    const res = await request(app).get("/").set("Content-Type", "text/plain");
    expect(res.status).toBe(200);
  });

  it("lets a JSON request through", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "x", password: "y" });
    expect(res.status).not.toBe(415);
  });

  it("lets a bodyless request through (no Content-Type set at all)", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).not.toBe(415);
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

// Every route handler's thrown/rejected errors reach app.onError natively
// under Hono (no asyncHandler wrapper needed) — this exercises that path
// end-to-end through a real route rather than just unit-testing onError in
// isolation.
describe("centralized error handling", () => {
  it("turns an unexpected thrown error into a 500 instead of hanging the request", async () => {
    mockQuery.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .get("/api/features")
      .set("Cookie", await authCookie({ userId: 1, role: "admin", schoolId: 10 }));
    expect(res.status).toBe(500);
    expect(res.body.message).toBeTruthy();
  });
});
