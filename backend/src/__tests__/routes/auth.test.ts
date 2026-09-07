jest.mock("../../config/db");
jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password"),
  compare: jest.fn()
}));
jest.mock("../../utils/featureFlags", () => ({
  isFeatureEnabled: jest.fn()
}));

import bcrypt from "bcryptjs";
import { decode } from "hono/jwt";
import app from "../../app";
import { rows } from "../helpers/db";
import { authCookie } from "../helpers/auth";
import { request } from "../helpers/request";
import { isFeatureEnabled } from "../../utils/featureFlags";

const { mockDb } = jest.requireMock<typeof import("../../config/__mocks__/db")>("../../config/db");
const mockQuery = mockDb.query as jest.Mock;
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock;

beforeEach(() => {
  // resetMocks (jest.config.js) wipes this default before every test, since
  // it clears implementations set at module-eval time too, not just call
  // history — restore it here so tests that don't care about hashing don't
  // each have to re-stub it.
  (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
});

describe("POST /api/auth/check-duplicate", () => {
  it("returns exists:false when no fields are provided", async () => {
    const res = await request(app).post("/api/auth/check-duplicate").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns exists:true, reason:email when the email is taken", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1 }]));

    const res = await request(app)
      .post("/api/auth/check-duplicate")
      .send({ email: "taken@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true, reason: "email" });
  });

  it("returns exists:true, reason:address when the address is taken", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([])) // email check
      .mockResolvedValueOnce(rows([{ id: 9 }])); // address check

    const res = await request(app)
      .post("/api/auth/check-duplicate")
      .send({ email: "new@example.com", address1: "1 Road", postcode: "AB1 2CD" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true, reason: "address" });
  });

  it("returns exists:false when nothing matches", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/auth/check-duplicate")
      .send({ email: "new@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false });
  });

  it("500s and reports exists:false when the query throws", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));

    const res = await request(app)
      .post("/api/auth/check-duplicate")
      .send({ email: "new@example.com" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ exists: false });
  });
});

const validParentPayload = () => ({
  user_type: "parent",
  school_code: "ILM2026",
  parent: {
    first_name: "Jane",
    surname: "Doe",
    relationship_to_student: "Mother",
    email: "jane@example.com",
    password: "Passw0rd!",
    contact_number: "555-1234",
    address1: "1 Road",
    postcode: "AB1 2CD"
  },
  students: [{ first_name: "Sam", surname: "Doe", class_code: "7A" }]
});

describe("POST /api/auth/register-parent", () => {
  it("400s on wrong user_type", async () => {
    const res = await request(app)
      .post("/api/auth/register-parent")
      .send({ ...validParentPayload(), user_type: "staff" });
    expect(res.status).toBe(400);
  });

  it("400s when parent or students is missing", async () => {
    const res = await request(app).post("/api/auth/register-parent").send({ user_type: "parent" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Missing parent or students/);
  });

  it("400s on an empty students array", async () => {
    const res = await request(app)
      .post("/api/auth/register-parent")
      .send({ ...validParentPayload(), students: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/At least one student/);
  });

  it("400s when parent name is missing", async () => {
    const payload = validParentPayload();
    (payload.parent as any).first_name = "";
    const res = await request(app).post("/api/auth/register-parent").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Parent name/);
  });

  it("400s when relationship_to_student is missing", async () => {
    const payload = validParentPayload();
    (payload.parent as any).relationship_to_student = "";
    const res = await request(app).post("/api/auth/register-parent").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Relationship/);
  });

  it("400s when email or password is missing", async () => {
    const payload = validParentPayload();
    (payload.parent as any).password = "";
    const res = await request(app).post("/api/auth/register-parent").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Email and password/);
  });

  it("400s when the password is too weak", async () => {
    const payload = validParentPayload();
    (payload.parent as any).password = "short1";
    const res = await request(app).post("/api/auth/register-parent").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 8 characters/);
  });

  it("400s when the email isn't a valid format", async () => {
    const payload = validParentPayload();
    (payload.parent as any).email = "not-an-email";
    const res = await request(app).post("/api/auth/register-parent").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid email/);
  });

  it("400s when contact_number is missing", async () => {
    const payload = validParentPayload();
    (payload.parent as any).contact_number = "";
    const res = await request(app).post("/api/auth/register-parent").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Contact number/);
  });

  it("400s when school_code is missing", async () => {
    const res = await request(app)
      .post("/api/auth/register-parent")
      .send({ ...validParentPayload(), school_code: "" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/School code/);
  });

  it("400s when a student is missing a name or class_code", async () => {
    const payload = validParentPayload();
    payload.students = [{ first_name: "Sam", surname: "Doe", class_code: "" }];
    const res = await request(app).post("/api/auth/register-parent").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/class code/);
  });

  it("400s when the school code does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([])); // schools lookup, no match

    const res = await request(app).post("/api/auth/register-parent").send(validParentPayload());

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid school code/);
  });

  it("400s when a class code does not exist within that school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // school found
      .mockResolvedValueOnce(rows([])); // class not found

    const res = await request(app).post("/api/auth/register-parent").send(validParentPayload());

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid class code: 7A/);
  });

  it("409s when the email is already registered", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // school found
      .mockResolvedValueOnce(rows([{ id: 2 }])) // class found
      .mockResolvedValueOnce(rows([{ id: 99 }])); // duplicate email

    const res = await request(app).post("/api/auth/register-parent").send(validParentPayload());

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Email already exists/);
  });

  it("409s when the address is already registered", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // school found
      .mockResolvedValueOnce(rows([{ id: 2 }])) // class found
      .mockResolvedValueOnce(rows([])) // email check, clear
      .mockResolvedValueOnce(rows([{ id: 3 }])); // address check, taken

    const res = await request(app).post("/api/auth/register-parent").send(validParentPayload());

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Address already registered/);
  });

  it("registers successfully and inserts the parent, student and class link", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // school found
      .mockResolvedValueOnce(rows([{ id: 55 }])) // class found
      .mockResolvedValueOnce(rows([])) // email check, clear
      .mockResolvedValueOnce(rows([])) // address check, clear
      .mockResolvedValueOnce(rows([{ id: 4 }])) // pending role id
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockResolvedValueOnce(rows([{ id: 100 }])) // insert users RETURNING id
      .mockResolvedValueOnce(rows([{ id: 200 }])) // insert parents RETURNING id
      .mockResolvedValueOnce(rows([])) // guardian_code uniqueness check
      .mockResolvedValueOnce(rows([{ id: 300 }])) // insert students RETURNING id
      .mockResolvedValueOnce(rows([])) // insert student_guardians
      .mockResolvedValueOnce(rows([])) // insert student_classes
      .mockResolvedValueOnce(rows([])); // COMMIT

    const res = await request(app).post("/api/auth/register-parent").send(validParentPayload());

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/Pending approval/);
    expect(mockQuery).toHaveBeenCalledWith("BEGIN");
    expect(mockQuery).toHaveBeenCalledWith("COMMIT");
    expect(mockQuery).not.toHaveBeenCalledWith("ROLLBACK");

    const studentInsertCall = mockQuery.mock.calls[9];
    expect(studentInsertCall[0]).toMatch(/INSERT INTO students/);
    const guardianLinkCall = mockQuery.mock.calls[10];
    expect(guardianLinkCall[0]).toMatch(/INSERT INTO student_guardians/);
    expect(guardianLinkCall[1]).toEqual([300, 200]);
    const classLinkCall = mockQuery.mock.calls[11];
    expect(classLinkCall[0]).toMatch(/INSERT INTO student_classes/);
    expect(classLinkCall[1]).toEqual([300, 55]);
  });

  it("400s when a guardian_links entry has no guardian_code", async () => {
    const payload = { ...validParentPayload(), students: [], guardian_links: [{ guardian_code: "" }] };
    const res = await request(app).post("/api/auth/register-parent").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/guardian code/);
  });

  it("400s when a guardian_links code does not resolve within that school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // school found
      .mockResolvedValueOnce(rows([{ id: 55 }])) // class found
      .mockResolvedValueOnce(rows([])); // guardian code not found

    const res = await request(app)
      .post("/api/auth/register-parent")
      .send({ ...validParentPayload(), guardian_links: [{ guardian_code: "BADCODE1" }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid guardian code: BADCODE1/);
  });

  it("registers with a guardian_links entry, inserting a pending student_guardians row", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // school found
      .mockResolvedValueOnce(rows([{ id: 55 }])) // class found
      .mockResolvedValueOnce(rows([{ id: 900 }])) // guardian code resolved to an existing student
      .mockResolvedValueOnce(rows([])) // email check, clear
      .mockResolvedValueOnce(rows([])) // address check, clear
      .mockResolvedValueOnce(rows([{ id: 4 }])) // pending role id
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockResolvedValueOnce(rows([{ id: 100 }])) // insert users RETURNING id
      .mockResolvedValueOnce(rows([{ id: 200 }])) // insert parents RETURNING id
      .mockResolvedValueOnce(rows([])) // guardian_code uniqueness check (for the new student)
      .mockResolvedValueOnce(rows([{ id: 300 }])) // insert students RETURNING id
      .mockResolvedValueOnce(rows([])) // insert student_guardians (approved, new student)
      .mockResolvedValueOnce(rows([])) // insert student_classes
      .mockResolvedValueOnce(rows([])) // insert student_guardians (pending, linked student)
      .mockResolvedValueOnce(rows([])); // COMMIT

    const res = await request(app)
      .post("/api/auth/register-parent")
      .send({ ...validParentPayload(), guardian_links: [{ guardian_code: "STUD0001" }] });

    expect(res.status).toBe(201);
    const pendingLinkCall = mockQuery.mock.calls[13];
    expect(pendingLinkCall[0]).toMatch(/INSERT INTO student_guardians/);
    expect(pendingLinkCall[0]).toMatch(/'pending'/);
    expect(pendingLinkCall[1]).toEqual([900, 200]);
  });

  it("rolls back and 500s when the insert transaction throws", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }]))
      .mockResolvedValueOnce(rows([{ id: 55 }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{ id: 4 }]))
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockRejectedValueOnce(new Error("insert failed"));

    const res = await request(app).post("/api/auth/register-parent").send(validParentPayload());

    expect(res.status).toBe(500);
    expect(mockQuery).toHaveBeenCalledWith("ROLLBACK");
  });
});

const validStaffPayload = () => ({
  user_type: "staff",
  first_name: "Alex",
  surname: "Smith",
  gender: "Male",
  email: "alex@example.com",
  password: "Passw0rd!",
  phone_number: "555-9999",
  school_code: "ILM2026"
});

describe("POST /api/auth/register-staff", () => {
  it("400s on wrong user_type", async () => {
    const res = await request(app)
      .post("/api/auth/register-staff")
      .send({ ...validStaffPayload(), user_type: "parent" });
    expect(res.status).toBe(400);
  });

  it("400s when name is missing", async () => {
    const payload = validStaffPayload();
    (payload as any).first_name = "";
    const res = await request(app).post("/api/auth/register-staff").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Staff name/);
  });

  it("400s when gender is missing", async () => {
    const payload = validStaffPayload();
    (payload as any).gender = "";
    const res = await request(app).post("/api/auth/register-staff").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Gender/);
  });

  it("400s when email/password is missing", async () => {
    const payload = validStaffPayload();
    (payload as any).password = "";
    const res = await request(app).post("/api/auth/register-staff").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Email and password/);
  });

  it("400s when the password is too weak", async () => {
    const payload = validStaffPayload();
    (payload as any).password = "alllettersnodigits";
    const res = await request(app).post("/api/auth/register-staff").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 8 characters/);
  });

  it("400s when the email isn't a valid format", async () => {
    const payload = validStaffPayload();
    (payload as any).email = "not-an-email";
    const res = await request(app).post("/api/auth/register-staff").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid email/);
  });

  it("400s when phone_number is missing", async () => {
    const payload = validStaffPayload();
    (payload as any).phone_number = "";
    const res = await request(app).post("/api/auth/register-staff").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Phone number/);
  });

  it("400s when school_code is missing", async () => {
    const payload = validStaffPayload();
    (payload as any).school_code = "";
    const res = await request(app).post("/api/auth/register-staff").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/School code/);
  });

  it("400s when the school code does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/auth/register-staff").send(validStaffPayload());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid school code/);
  });

  it("409s when the email already exists", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // school found
      .mockResolvedValueOnce(rows([{ id: 2 }])); // email taken

    const res = await request(app).post("/api/auth/register-staff").send(validStaffPayload());
    expect(res.status).toBe(409);
  });

  it("registers successfully and inserts staff_details with a pending role", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // school found
      .mockResolvedValueOnce(rows([])) // email check, clear
      .mockResolvedValueOnce(rows([{ id: 4 }])) // pending role id
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockResolvedValueOnce(rows([{ id: 100 }])) // insert users RETURNING id
      .mockResolvedValueOnce(rows([])) // insert staff_details
      .mockResolvedValueOnce(rows([])); // COMMIT

    const res = await request(app).post("/api/auth/register-staff").send(validStaffPayload());

    expect(res.status).toBe(201);
    expect(mockQuery).toHaveBeenCalledWith("COMMIT");
    expect(mockQuery.mock.calls[4][0]).toMatch(/INSERT INTO users/);
    expect(mockQuery.mock.calls[4][1]).toContain("staff");
    expect(mockQuery.mock.calls[5][0]).toMatch(/INSERT INTO staff_details/);
  });
});

describe("POST /api/auth/login", () => {
  it("400s when username or password is missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "jdoe" });
    expect(res.status).toBe(400);
  });

  it("401s when no matching user is found", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/auth/login").send({ username: "ghost", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid credentials/);
  });

  it("401s when the password does not match", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ id: 1, username: "jdoe", email: "jdoe@x.com", password_hash: "hash", school_id: 1, token_version: 2, role: "admin" }])
    );
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

    const res = await request(app).post("/api/auth/login").send({ username: "jdoe", password: "wrong" });

    expect(res.status).toBe(401);
  });

  it("logs in successfully and sets an httpOnly cookie", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ id: 1, username: "jdoe", email: "jdoe@x.com", password_hash: "hash", school_id: 1, token_version: 2, role: "admin" }])
    );
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

    const res = await request(app).post("/api/auth/login").send({ username: "jdoe", password: "Passw0rd!" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Logged in", role: "admin" });
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/^token=/);
    expect(setCookie).toMatch(/HttpOnly/i);

    const token = setCookie!.split(";")[0].split("=")[1];
    const decoded = decode(token).payload as any;
    expect(decoded.tokenVersion).toBe(2);
    expect(decoded.mustResetPassword).toBe(false);
  });

  it("bakes must_reset_password=true into the token when it's set on the account", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{
        id: 1, username: "jdoe", email: "jdoe@x.com", password_hash: "hash",
        school_id: 1, token_version: 2, must_reset_password: 1, role: "teacher"
      }])
    );
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "jdoe", password: "Passw0rd!" });

    expect(res.status).toBe(200);
    const token = res.headers.get("set-cookie")!.split(";")[0].split("=")[1];
    const decoded = decode(token).payload as any;
    expect(decoded.mustResetPassword).toBe(true);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the token cookie when there was no session to begin with", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Logged out" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("revokes the session server-side by bumping token_version", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", await authCookie({ userId: 42, role: "teacher", schoolId: 1 }));

    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [42]);
  });

  it("still clears the cookie and succeeds even if revocation fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", await authCookie({ userId: 42, role: "teacher", schoolId: 1 }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Logged out" });
  });
});

describe("GET /api/auth/me", () => {
  it("401s when not authenticated", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user with a derived fullName", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ first_name: "Jane", surname: "Doe" }]));

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", await authCookie({ userId: 1, role: "parent", schoolId: 1 }));

    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe("Jane Doe");
    expect(res.body.user.userId).toBe(1);
  });

  it("falls back to req.user with fullName:null when the details query fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", await authCookie({ userId: 1, role: "parent", schoolId: 1 }));

    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(1);
  });
});

describe("POST /api/auth/change-password", () => {
  it("401s when not authenticated", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .send({ current_password: "Passw0rd!", new_password: "NewPassw0rd!" });
    expect(res.status).toBe(401);
  });

  it("403s when the feature is disabled for the caller's school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", await authCookie({ userId: 1, role: "teacher", schoolId: 10 }))
      .send({ current_password: "Passw0rd!", new_password: "NewPassw0rd!" });
    expect(res.status).toBe(403);
  });

  it("400s when a field is missing", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", await authCookie({ userId: 1, role: "teacher", schoolId: 10 }))
      .send({ current_password: "Passw0rd!" });
    expect(res.status).toBe(400);
  });

  it("404s when the user no longer exists", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", await authCookie({ userId: 1, role: "teacher", schoolId: 10 }))
      .send({ current_password: "Passw0rd!", new_password: "NewPassw0rd!" });
    expect(res.status).toBe(404);
  });

  it("401s when current_password is wrong", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ password_hash: "hash", token_version: 3 }]));
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", await authCookie({ userId: 1, role: "teacher", schoolId: 10 }))
      .send({ current_password: "WrongPass1", new_password: "NewPassw0rd!" });

    expect(res.status).toBe(401);
  });

  it("400s when new_password does not meet the strength rule", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ password_hash: "hash", token_version: 3 }]));
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", await authCookie({ userId: 1, role: "teacher", schoolId: 10 }))
      .send({ current_password: "Passw0rd!", new_password: "short" });

    expect(res.status).toBe(400);
  });

  it("updates the hash, bumps token_version, and issues a fresh cookie", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ password_hash: "hash", token_version: 3 }]))
      .mockResolvedValueOnce(rows([]));
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", await authCookie({ userId: 1, username: "jdoe", role: "teacher", schoolId: 10 }))
      .send({ current_password: "Passw0rd!", new_password: "NewPassw0rd!" });

    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenLastCalledWith("UPDATE users SET password_hash = $1, token_version = $2 WHERE id = $3", [
      "hashed-password",
      4,
      1
    ]);
    const setCookie = res.headers.get("set-cookie");
    const token = setCookie!.split(";")[0].split("=")[1];
    const decoded = decode(token).payload as any;
    expect(decoded.tokenVersion).toBe(4);
  });

  it("bypasses the feature check for system_admin", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ password_hash: "hash", token_version: 0 }]))
      .mockResolvedValueOnce(rows([]));
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", await authCookie({ userId: 99, role: "system_admin", schoolId: null }))
      .send({ current_password: "Passw0rd!", new_password: "NewPassw0rd!" });

    expect(res.status).toBe(200);
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/force-password-reset", () => {
  it("401s when not authenticated", async () => {
    const res = await request(app)
      .post("/api/auth/force-password-reset")
      .send({ new_password: "NewPassw0rd!" });
    expect(res.status).toBe(401);
  });

  it("400s when no reset is pending for the account", async () => {
    const res = await request(app)
      .post("/api/auth/force-password-reset")
      .set("Cookie", await authCookie({ userId: 1, role: "teacher", schoolId: 10, mustResetPassword: false }))
      .send({ new_password: "NewPassw0rd!" });
    expect(res.status).toBe(400);
  });

  it("400s when the new password does not meet the strength rule", async () => {
    const res = await request(app)
      .post("/api/auth/force-password-reset")
      .set("Cookie", await authCookie({ userId: 1, role: "teacher", schoolId: 10, mustResetPassword: true }))
      .send({ new_password: "short" });
    expect(res.status).toBe(400);
  });

  it("404s when the user no longer exists", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/auth/force-password-reset")
      .set("Cookie", await authCookie({ userId: 1, role: "teacher", schoolId: 10, mustResetPassword: true }))
      .send({ new_password: "NewPassw0rd!" });
    expect(res.status).toBe(404);
  });

  it("clears must_reset_password, bumps token_version, and issues a fresh cookie", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ token_version: 5 }]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/auth/force-password-reset")
      .set("Cookie", await authCookie({ userId: 1, username: "jdoe", role: "teacher", schoolId: 10, mustResetPassword: true }))
      .send({ new_password: "NewPassw0rd!" });

    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenLastCalledWith(
      "UPDATE users SET password_hash = $1, must_reset_password = FALSE, token_version = $2 WHERE id = $3",
      ["hashed-password", 6, 1]
    );

    const token = res.headers.get("set-cookie")!.split(";")[0].split("=")[1];
    const decoded = decode(token).payload as any;
    expect(decoded.tokenVersion).toBe(6);
    expect(decoded.mustResetPassword).toBe(false);
  });

  it("is reachable (not 403'd) even though must_reset_password blocks other routes", async () => {
    // Confirms authMiddleware's allowlist matches on the real, fully-mounted
    // path (/api/auth/force-password-reset), not some router-relative form.
    mockQuery
      .mockResolvedValueOnce(rows([{ token_version: 0 }]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/auth/force-password-reset")
      .set("Cookie", await authCookie({ userId: 1, role: "teacher", schoolId: 10, mustResetPassword: true }))
      .send({ new_password: "NewPassw0rd!" });

    expect(res.status).not.toBe(403);
  });
});

describe("must_reset_password blocks other routers, not just auth.ts", () => {
  it("403s a request to an unrelated router (admin.ts) when must_reset_password is true", async () => {
    const res = await request(app)
      .get("/api/admin/teachers")
      .set("Cookie", await authCookie({ userId: 1, role: "admin", schoolId: 10, mustResetPassword: true }));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PASSWORD_RESET_REQUIRED");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
