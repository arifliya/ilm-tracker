jest.mock("../../config/db");
jest.mock("../../utils/featureFlags", () => ({
  resetExpiredFeatureFlags: jest.fn().mockResolvedValue(undefined),
  isFeatureEnabled: jest.fn()
}));

import app from "../../app";
import { rows } from "../helpers/db";
import { authCookie } from "../helpers/auth";
import { isFeatureEnabled } from "../../utils/featureFlags";
import { request } from "../helpers/request";

const { mockDb } = jest.requireMock<typeof import("../../config/__mocks__/db")>("../../config/db");
const mockQuery = mockDb.query as jest.Mock;
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock;

let sysAdminCookie: string;
let ownerCookie: string;

beforeAll(async () => {
  sysAdminCookie = await authCookie({ userId: 1, role: "system_admin", schoolId: null });
  ownerCookie = await authCookie({ userId: 2, role: "owner", schoolId: 10 });
});

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
    const res = await request(app).post("/api/system-admin/schools").set("Cookie", sysAdminCookie).send({});
    expect(res.status).toBe(400);
  });

  it("creates a school with a freshly generated unique code", async () => {
    mockQuery.mockResolvedValueOnce(rows([])); // first candidate is unused
    mockQuery.mockResolvedValueOnce(rows([])); // insert

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
      .mockResolvedValueOnce(rows([])); // insert

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
    mockQuery
      .mockResolvedValueOnce(rows([])) // key uniqueness check
      .mockResolvedValueOnce(rows([{ id: 5 }])) // insert
      .mockResolvedValueOnce(rows([])); // audit log insert

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
    mockQuery
      .mockResolvedValueOnce(rows([{ feature_key: "notifications" }])) // flag lookup
      .mockResolvedValueOnce(rows([])) // upsert
      .mockResolvedValueOnce(rows([])); // audit log insert
    const res = await request(app)
      .put("/api/system-admin/feature-flags/1/schools/2")
      .set("Cookie", sysAdminCookie)
      .send({ enabled: true });
    expect(res.status).toBe(200);
  });

  it("404s when the flag doesn't exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([])); // flag lookup finds nothing
    const res = await request(app)
      .put("/api/system-admin/feature-flags/999/schools/2")
      .set("Cookie", sysAdminCookie)
      .send({ enabled: true });
    expect(res.status).toBe(404);
  });

  it("404s when the school doesn't exist (FK violation on insert)", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ feature_key: "notifications" }])) // flag lookup
      .mockRejectedValueOnce({ code: "23503" }); // upsert fails on bad schoolId
    const res = await request(app)
      .put("/api/system-admin/feature-flags/1/schools/999")
      .set("Cookie", sysAdminCookie)
      .send({ enabled: true });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/system-admin/feature-flags/:id/schools/:schoolId", () => {
  it("clears the override", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ feature_key: "notifications" }])) // flag lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // delete
      .mockResolvedValueOnce(rows([])); // audit log insert
    const res = await request(app)
      .delete("/api/system-admin/feature-flags/1/schools/2")
      .set("Cookie", sysAdminCookie);
    expect(res.status).toBe(200);
  });

  it("skips the audit log when nothing was actually cleared", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ feature_key: "notifications" }])) // flag lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // delete, no override existed
    const res = await request(app)
      .delete("/api/system-admin/feature-flags/1/schools/2")
      .set("Cookie", sysAdminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe("PUT /api/system-admin/feature-flags/:id", () => {
  it("400s when name is missing", async () => {
    const res = await request(app).put("/api/system-admin/feature-flags/1").set("Cookie", sysAdminCookie).send({});
    expect(res.status).toBe(400);
  });

  it("404s when the flag doesn't exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([])); // flag lookup finds nothing
    const res = await request(app)
      .put("/api/system-admin/feature-flags/999")
      .set("Cookie", sysAdminCookie)
      .send({ name: "Renamed" });
    expect(res.status).toBe(404);
  });

  it("updates the flag metadata", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ feature_key: "notifications" }])) // flag lookup
      .mockResolvedValueOnce(rows([])) // update
      .mockResolvedValueOnce(rows([])); // audit log insert
    const res = await request(app)
      .put("/api/system-admin/feature-flags/1")
      .set("Cookie", sysAdminCookie)
      .send({ name: "Renamed", default_enabled: false });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/system-admin/feature-flags/:id", () => {
  it("404s when the flag doesn't exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([])); // flag lookup finds nothing
    const res = await request(app).delete("/api/system-admin/feature-flags/999").set("Cookie", sysAdminCookie);
    expect(res.status).toBe(404);
  });

  it("deletes the flag", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ feature_key: "notifications" }])) // flag lookup
      .mockResolvedValueOnce(rows([])) // delete
      .mockResolvedValueOnce(rows([])); // audit log insert
    const res = await request(app).delete("/api/system-admin/feature-flags/1").set("Cookie", sysAdminCookie);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/system-admin/feature-flags/audit-log", () => {
  it("403s for a non-system_admin", async () => {
    const res = await request(app).get("/api/system-admin/feature-flags/audit-log").set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("returns recent audit entries", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          id: 1,
          feature_flag_id: 1,
          feature_key: "notifications",
          school_id: 1,
          school_name: "Ilm School",
          action: "school_override_set",
          actor_user_id: 1,
          actor_username: "sysadmin",
          details: { enabled: true },
          created_at: "2026-01-01 10:00:00"
        }
      ])
    );
    const res = await request(app).get("/api/system-admin/feature-flags/audit-log").set("Cookie", sysAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].action).toBe("school_override_set");
  });
});

describe("POST /api/system-admin/owners/:id/reset-password", () => {
  it("403s for a non-system_admin", async () => {
    const res = await request(app).post("/api/system-admin/owners/5/reset-password").set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("404s when the user doesn't exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/system-admin/owners/999/reset-password")
      .set("Cookie", sysAdminCookie);
    expect(res.status).toBe(404);
  });

  it("403s when the target user is not an owner", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10, role_name: "teacher" }]));
    const res = await request(app)
      .post("/api/system-admin/owners/5/reset-password")
      .set("Cookie", sysAdminCookie);
    expect(res.status).toBe(403);
  });

  it("403s when password management is disabled for the owner's school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10, role_name: "owner" }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app)
      .post("/api/system-admin/owners/5/reset-password")
      .set("Cookie", sysAdminCookie);
    expect(res.status).toBe(403);
  });

  it("resets the owner's password and returns a one-time temporary password", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10, role_name: "owner" }])) // user lookup
      .mockResolvedValueOnce(rows([])); // update
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/system-admin/owners/5/reset-password")
      .set("Cookie", sysAdminCookie);

    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword).toBeTruthy();
    expect(mockQuery.mock.calls[1][1][1]).toBe("5");
  });
});
