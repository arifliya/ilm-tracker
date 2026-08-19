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
  it("401s when there is no token cookie", () => {
    const req = { cookies: {} } as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Not authenticated" });
    expect(next).not.toHaveBeenCalled();
  });

  it("401s on an invalid/garbage token", () => {
    const req = { cookies: { token: "not-a-real-jwt" } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("401s on a token signed with the wrong secret", () => {
    const badToken = jwt.sign({ userId: 1, role: "admin" }, "wrong-secret");
    const req = { cookies: { token: badToken } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches the decoded payload to req.user and calls next on a valid token", () => {
    const token = jwt.sign(
      { userId: 7, username: "jdoe", role: "teacher", schoolId: 3 },
      env.JWT_SECRET
    );
    const req = { cookies: { token } } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ userId: 7, username: "jdoe", role: "teacher", schoolId: 3 });
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
