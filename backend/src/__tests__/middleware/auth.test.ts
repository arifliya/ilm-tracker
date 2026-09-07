// authMiddleware only ever touches the DB through isTokenVersionValid,
// which setupAuthMocks.ts already auto-mocks globally (defaulting to
// "valid") — so this file doesn't need config/db mocked or a dbMiddleware
// mounted at all, unlike the route test files.

import { Hono } from "hono";
import { sign, decode } from "hono/jwt";
import type { AppEnv } from "../../types/env";
import { authMiddleware, requireRole } from "../../middleware/auth";
import { request } from "../helpers/request";
import { TEST_JWT_SECRET } from "../helpers/testEnv";

// A tiny real Hono app (not a hand-built fake Context) drives these tests
// through app.request(), same pattern as every route test file — this
// exercises authMiddleware/requireRole exactly as a real request would,
// including cookie handling, rather than mocking Hono's internals by hand.
const app = new Hono<AppEnv>();
app.get("/protected", authMiddleware, c => c.json({ user: c.get("user") }));
// Mounted at a real MUST_RESET_ALLOWLIST path (see middleware/auth.ts) so
// the mustResetPassword tests below can exercise the allowlist itself,
// which is matched against c.req.path — "/protected" above deliberately
// isn't on it.
app.get("/api/auth/force-password-reset", authMiddleware, c => c.json({ user: c.get("user") }));
app.get(
  "/role-gated",
  async (c, next) => {
    // Stands in for authMiddleware in requireRole's own tests, which want
    // to exercise requireRole in isolation from JWT/cookie handling — same
    // intent as the old tests constructing a bare `{ user: {...} }` req.
    const roleHeader = c.req.header("X-Test-Role");
    if (roleHeader) {
      c.set("user", {
        userId: 1,
        username: "x",
        role: roleHeader as any,
        schoolId: 1,
        tokenVersion: 0,
        sessionStartedAt: 0,
        mustResetPassword: false
      });
    }
    await next();
  },
  requireRole("admin", "owner"),
  c => c.json({ ok: true })
);

const signToken = (payload: object) => sign(payload as any, TEST_JWT_SECRET);

describe("authMiddleware", () => {
  it("401s when there is no token cookie", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Not authenticated" });
  });

  it("401s on an invalid/garbage token", async () => {
    const res = await request(app).get("/protected").set("Cookie", "token=not-a-real-jwt");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Invalid token" });
  });

  it("401s on a token signed with the wrong secret", async () => {
    const badToken = await sign({ userId: 1, role: "admin" } as any, "wrong-secret");
    const res = await request(app).get("/protected").set("Cookie", `token=${badToken}`);
    expect(res.status).toBe(401);
  });

  it("401s when the token's version doesn't match the current one (revoked)", async () => {
    const { isTokenVersionValid } = await import("../../utils/tokenVersion");
    (isTokenVersionValid as jest.Mock).mockResolvedValueOnce(false);

    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({
      userId: 7,
      username: "jdoe",
      role: "teacher",
      schoolId: 3,
      tokenVersion: 0,
      iat: now,
      exp: now + 3600
    });

    const res = await request(app).get("/protected").set("Cookie", `token=${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Session no longer valid, please log in again" });
  });

  it("attaches the decoded payload to c.get('user') and calls next on a valid token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({
      userId: 7,
      username: "jdoe",
      role: "teacher",
      schoolId: 3,
      tokenVersion: 0,
      iat: now,
      exp: now + 3600
    });

    const res = await request(app).get("/protected").set("Cookie", `token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ userId: 7, username: "jdoe", role: "teacher", schoolId: 3 });
  });

  it("silently reissues the cookie when the token is past the halfway point of its lifetime", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({
      userId: 7,
      username: "jdoe",
      role: "teacher",
      schoolId: 3,
      tokenVersion: 0,
      iat: now - 1800,
      exp: now + 300
    });

    const res = await request(app).get("/protected").set("Cookie", `token=${token}`);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/^token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it("carries mustResetPassword forward on a sliding-session refresh", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({
      userId: 7,
      username: "jdoe",
      role: "teacher",
      schoolId: 3,
      tokenVersion: 0,
      mustResetPassword: true,
      iat: now - 1800,
      exp: now + 300
    });

    // Allowlisted, so the mustResetPassword check itself doesn't 403
    // before the sliding-session refresh logic runs.
    const res = await request(app).get("/api/auth/force-password-reset").set("Cookie", `token=${token}`);
    const setCookie = res.headers.get("set-cookie")!;
    const freshToken = setCookie.split(";")[0].split("=")[1];
    const decoded = decode(freshToken).payload as any;
    expect(decoded.mustResetPassword).toBe(true);
  });

  it("does not reissue the cookie when the token is still in the first half of its lifetime", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({
      userId: 7,
      username: "jdoe",
      role: "teacher",
      schoolId: 3,
      tokenVersion: 0,
      iat: now,
      exp: now + 3600
    });

    const res = await request(app).get("/protected").set("Cookie", `token=${token}`);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does not reissue the cookie once the 12h absolute session cap has passed", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Session began 12.5h ago (past the cap) — this particular token is
    // itself only a few minutes from its own natural expiry, same as the
    // last-ever refresh under the cap would have produced.
    const token = await signToken({
      userId: 7,
      username: "jdoe",
      role: "teacher",
      schoolId: 3,
      tokenVersion: 0,
      sessionStartedAt: now - 12.5 * 60 * 60,
      iat: now - 1800,
      exp: now + 60
    });

    const res = await request(app).get("/protected").set("Cookie", `token=${token}`);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("403s a request with mustResetPassword=true when the route isn't allowlisted", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({
      userId: 7,
      username: "jdoe",
      role: "teacher",
      schoolId: 3,
      tokenVersion: 0,
      mustResetPassword: true,
      iat: now,
      exp: now + 3600
    });

    const res = await request(app).get("/protected").set("Cookie", `token=${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: "You must reset your password before continuing",
      code: "PASSWORD_RESET_REQUIRED"
    });
  });

  it("lets an allowlisted route through when mustResetPassword=true", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({
      userId: 7,
      username: "jdoe",
      role: "teacher",
      schoolId: 3,
      tokenVersion: 0,
      mustResetPassword: true,
      iat: now,
      exp: now + 3600
    });

    const res = await request(app).get("/api/auth/force-password-reset").set("Cookie", `token=${token}`);

    expect(res.status).toBe(200);
  });

  it("clamps the reissued token's expiry to whatever's left under the 12h cap", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Session began 11h50m ago — only 10 minutes remain under the 12h cap,
    // well short of a full new 1h rolling window.
    const token = await signToken({
      userId: 7,
      username: "jdoe",
      role: "teacher",
      schoolId: 3,
      tokenVersion: 0,
      sessionStartedAt: now - (11 * 60 * 60 + 50 * 60),
      iat: now - 1800,
      exp: now + 300
    });

    const res = await request(app).get("/protected").set("Cookie", `token=${token}`);
    const setCookie = res.headers.get("set-cookie")!;
    const freshToken = setCookie.split(";")[0].split("=")[1];
    const decoded = decode(freshToken).payload as any;
    // Should land right around the cap (sessionStartedAt + 12h), not a full
    // hour out from now.
    expect(decoded.exp).toBeLessThan(now + 700);
    expect(decoded.exp).toBeGreaterThan(now + 500);
  });
});

describe("requireRole", () => {
  it("401s when the user is missing", async () => {
    const res = await request(app).get("/role-gated");
    expect(res.status).toBe(401);
  });

  it("403s when the user's role is not in the allowed list", async () => {
    const res = await request(app).get("/role-gated").set("X-Test-Role", "parent");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Forbidden" });
  });

  it("calls next when the user's role is allowed", async () => {
    const res = await request(app).get("/role-gated").set("X-Test-Role", "owner");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
