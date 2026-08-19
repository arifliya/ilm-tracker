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

const sysAdminCookie = authCookie({ userId: 1, role: "system_admin", schoolId: null });
const ownerCookie = authCookie({ userId: 2, role: "owner", schoolId: 10 });

describe("GET /api/system-admin/schools", () => {
  it("403s for a non-system_admin", async () => {
    const res = await request(app).get("/api/system-admin/schools").set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("lists schools", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, name: "Ilm School", school_code: "ILM2026" }]));
    const res = await request(app).get("/api/system-admin/schools").set("Cookie", sysAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("POST /api/system-admin/schools", () => {
  it("400s when name is missing", async () => {
    const res = await request(app)
      .post("/api/system-admin/schools")
      .set("Cookie", sysAdminCookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("creates a school with a freshly generated unique code", async () => {
    mockQuery.mockResolvedValueOnce(rows([])); // first candidate is unused
    mockQuery.mockResolvedValueOnce(rows({})); // insert

    const res = await request(app)
      .post("/api/system-admin/schools")
      .set("Cookie", sysAdminCookie)
      .send({ name: "Greenwood Academy" });

    expect(res.status).toBe(201);
    expect(res.body.school_code).toHaveLength(8);
  });

  it("retries when a generated code collides, and succeeds on the next attempt", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // first candidate taken
      .mockResolvedValueOnce(rows([])) // second candidate free
      .mockResolvedValueOnce(rows({})); // insert

    const res = await request(app)
      .post("/api/system-admin/schools")
      .set("Cookie", sysAdminCookie)
      .send({ name: "Greenwood Academy" });

    expect(res.status).toBe(201);
  });
});

describe("GET /api/system-admin/feature-flags", () => {
  it("returns flags, schools, and overrides together", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, feature_key: "notifications" }]))
      .mockResolvedValueOnce(rows([{ id: 1, name: "Ilm School" }]))
      .mockResolvedValueOnce(rows([{ school_id: 1, feature_flag_id: 1, enabled: 1 }]));

    const res = await request(app).get("/api/system-admin/feature-flags").set("Cookie", sysAdminCookie);

    expect(res.status).toBe(200);
    expect(res.body.flags).toHaveLength(1);
    expect(res.body.schools).toHaveLength(1);
    expect(res.body.overrides).toHaveLength(1);
  });
});

describe("POST /api/system-admin/feature-flags", () => {
  it("400s on an invalid feature key", async () => {
    const res = await request(app)
      .post("/api/system-admin/feature-flags")
      .set("Cookie", sysAdminCookie)
      .send({ feature_key: "1-bad", name: "Bad" });
    expect(res.status).toBe(400);
  });

  it("400s when name is missing", async () => {
    const res = await request(app)
      .post("/api/system-admin/feature-flags")
      .set("Cookie", sysAdminCookie)
      .send({ feature_key: "cool_feature" });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid expiry format", async () => {
    const res = await request(app)
      .post("/api/system-admin/feature-flags")
      .set("Cookie", sysAdminCookie)
      .send({ feature_key: "cool_feature", name: "Cool", expires_at: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("409s when the key already exists", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1 }]));
    const res = await request(app)
      .post("/api/system-admin/feature-flags")
      .set("Cookie", sysAdminCookie)
      .send({ feature_key: "cool_feature", name: "Cool" });
    expect(res.status).toBe(409);
  });

  it("creates a feature flag and normalizes the expiry datetime", async () => {
    mockQuery.mockResolvedValueOnce(rows([])).mockResolvedValueOnce(rows({}));

    const res = await request(app)
      .post("/api/system-admin/feature-flags")
      .set("Cookie", sysAdminCookie)
      .send({ feature_key: "cool_feature", name: "Cool", default_enabled: true, expires_at: "2026-01-01T10:30" });

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[1][1]).toEqual(["cool_feature", "Cool", null, true, "2026-01-01 10:30:00"]);
  });
});

describe("PUT /api/system-admin/feature-flags/:id/schools/:schoolId", () => {
  it("400s when enabled is not a boolean", async () => {
    const res = await request(app)
      .put("/api/system-admin/feature-flags/1/schools/2")
      .set("Cookie", sysAdminCookie)
      .send({ enabled: "yes" });
    expect(res.status).toBe(400);
  });

  it("sets the per-school override", async () => {
    mockQuery.mockResolvedValueOnce(rows({}));
    const res = await request(app)
      .put("/api/system-admin/feature-flags/1/schools/2")
      .set("Cookie", sysAdminCookie)
      .send({ enabled: true });
    expect(res.status).toBe(200);
  });

  it("404s when the flag or school doesn't exist (FK violation)", async () => {
    mockQuery.mockRejectedValueOnce({ code: "ER_NO_REFERENCED_ROW_2" });
    const res = await request(app)
      .put("/api/system-admin/feature-flags/999/schools/2")
      .set("Cookie", sysAdminCookie)
      .send({ enabled: true });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/system-admin/feature-flags/:id/schools/:schoolId", () => {
  it("clears the override", async () => {
    mockQuery.mockResolvedValueOnce(rows({}));
    const res = await request(app)
      .delete("/api/system-admin/feature-flags/1/schools/2")
      .set("Cookie", sysAdminCookie);
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/system-admin/feature-flags/:id", () => {
  it("400s when name is missing", async () => {
    const res = await request(app)
      .put("/api/system-admin/feature-flags/1")
      .set("Cookie", sysAdminCookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("404s when no row was affected", async () => {
    mockQuery.mockResolvedValueOnce(rows({ affectedRows: 0 }));
    const res = await request(app)
      .put("/api/system-admin/feature-flags/999")
      .set("Cookie", sysAdminCookie)
      .send({ name: "Renamed" });
    expect(res.status).toBe(404);
  });

  it("updates the flag metadata", async () => {
    mockQuery.mockResolvedValueOnce(rows({ affectedRows: 1 }));
    const res = await request(app)
      .put("/api/system-admin/feature-flags/1")
      .set("Cookie", sysAdminCookie)
      .send({ name: "Renamed", default_enabled: false });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/system-admin/feature-flags/:id", () => {
  it("404s when no row was affected", async () => {
    mockQuery.mockResolvedValueOnce(rows({ affectedRows: 0 }));
    const res = await request(app).delete("/api/system-admin/feature-flags/999").set("Cookie", sysAdminCookie);
    expect(res.status).toBe(404);
  });

  it("deletes the flag", async () => {
    mockQuery.mockResolvedValueOnce(rows({ affectedRows: 1 }));
    const res = await request(app).delete("/api/system-admin/feature-flags/1").set("Cookie", sysAdminCookie);
    expect(res.status).toBe(200);
  });
});
