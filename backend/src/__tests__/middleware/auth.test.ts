import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { authMiddleware, requireRole } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/auth";

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("authMiddleware", () => {
  it("401s when there is no token cookie", async () => {
    const req = { cookies: {} } as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Not authenticated" });
    expect(next).not.toHaveBeenCalled();
  });

  it("401s on an invalid/garbage token", async () => {
    const req = { cookies: { token: "not-a-real-jwt" } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("401s on a token signed with the wrong secret", async () => {
    const badToken = jwt.sign({ userId: 1, role: "admin" }, "wrong-secret");
    const req = { cookies: { token: badToken } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("401s when the token's version doesn't match the current one (revoked)", async () => {
    const { isTokenVersionValid } = await import("../../utils/tokenVersion");
    (isTokenVersionValid as jest.Mock).mockResolvedValueOnce(false);

    const token = jwt.sign(
      { userId: 7, username: "jdoe", role: "teacher", schoolId: 3, tokenVersion: 0 },
      env.JWT_SECRET
    );
    const req = { cookies: { token } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Session no longer valid, please log in again" });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches the decoded payload to req.user and calls next on a valid token", async () => {
    const token = jwt.sign(
      { userId: 7, username: "jdoe", role: "teacher", schoolId: 3, tokenVersion: 0 },
      env.JWT_SECRET
    );
    const req = { cookies: { token } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ userId: 7, username: "jdoe", role: "teacher", schoolId: 3 });
  });

  it("silently reissues the cookie when the token is past the halfway point of its lifetime", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { userId: 7, username: "jdoe", role: "teacher", schoolId: 3, tokenVersion: 0, iat: now - 1800, exp: now + 300 },
      env.JWT_SECRET
    );
    const req = { cookies: { token } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    res.cookie = jest.fn();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.cookie).toHaveBeenCalledWith("token", expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("carries mustResetPassword forward on a sliding-session refresh", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        userId: 7,
        username: "jdoe",
        role: "teacher",
        schoolId: 3,
        tokenVersion: 0,
        mustResetPassword: true,
        iat: now - 1800,
        exp: now + 300
      },
      env.JWT_SECRET
    );
    const req = { cookies: { token }, originalUrl: "/api/auth/me" } as unknown as AuthenticatedRequest;
    const res = mockRes();
    res.cookie = jest.fn();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    const freshToken = res.cookie.mock.calls[0][1];
    const decoded = jwt.verify(freshToken, env.JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.mustResetPassword).toBe(true);
  });

  it("does not reissue the cookie when the token is still in the first half of its lifetime", async () => {
    const token = jwt.sign(
      { userId: 7, username: "jdoe", role: "teacher", schoolId: 3, tokenVersion: 0 },
      env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    const req = { cookies: { token } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    res.cookie = jest.fn();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not reissue the cookie once the 12h absolute session cap has passed", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Session began 12.5h ago (past the cap) — this particular token is
    // itself only a few minutes from its own natural expiry, same as the
    // last-ever refresh under the cap would have produced.
    const token = jwt.sign(
      {
        userId: 7,
        username: "jdoe",
        role: "teacher",
        schoolId: 3,
        tokenVersion: 0,
        sessionStartedAt: now - 12.5 * 60 * 60,
        iat: now - 1800,
        exp: now + 60
      },
      env.JWT_SECRET
    );
    const req = { cookies: { token } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    res.cookie = jest.fn();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("403s a request with mustResetPassword=true when the route isn't allowlisted", async () => {
    const token = jwt.sign(
      { userId: 7, username: "jdoe", role: "teacher", schoolId: 3, tokenVersion: 0, mustResetPassword: true },
      env.JWT_SECRET
    );
    const req = { cookies: { token }, originalUrl: "/api/teacher/classes" } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "You must reset your password before continuing",
      code: "PASSWORD_RESET_REQUIRED"
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("lets an allowlisted route through when mustResetPassword=true", async () => {
    const token = jwt.sign(
      { userId: 7, username: "jdoe", role: "teacher", schoolId: 3, tokenVersion: 0, mustResetPassword: true },
      env.JWT_SECRET
    );
    const req = { cookies: { token }, originalUrl: "/api/auth/force-password-reset" } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("clamps the reissued token's expiry to whatever's left under the 12h cap", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Session began 11h50m ago — only 10 minutes remain under the 12h cap,
    // well short of a full new 1h rolling window.
    const token = jwt.sign(
      {
        userId: 7,
        username: "jdoe",
        role: "teacher",
        schoolId: 3,
        tokenVersion: 0,
        sessionStartedAt: now - (11 * 60 * 60 + 50 * 60),
        iat: now - 1800,
        exp: now + 300
      },
      env.JWT_SECRET
    );
    const req = { cookies: { token } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    res.cookie = jest.fn();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const freshToken = res.cookie.mock.calls[0][1];
    const decoded = jwt.verify(freshToken, env.JWT_SECRET) as jwt.JwtPayload;
    // Should land right around the cap (sessionStartedAt + 12h), not a full
    // hour out from now.
    expect(decoded.exp).toBeLessThan(now + 700);
    expect(decoded.exp).toBeGreaterThan(now + 500);
  });
});

describe("requireRole", () => {
  it("401s when req.user is missing", () => {
    const req = {} as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s when the user's role is not in the allowed list", () => {
    const req = { user: { userId: 1, username: "x", role: "parent", schoolId: 1 } } as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    requireRole("admin", "owner")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Forbidden" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when the user's role is allowed", () => {
    const req = { user: { userId: 1, username: "x", role: "owner", schoolId: 1 } } as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    requireRole("admin", "owner")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
