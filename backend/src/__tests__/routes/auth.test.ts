jest.mock("../../config/db");
jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password"),
  compare: jest.fn()
}));

import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../../app";
import { pool } from "../../config/db";
import { rows, mockConnection } from "../helpers/db";

const mockQuery = pool.query as jest.Mock;
const mockGetConnection = pool.getConnection as jest.Mock;

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
  students: [
    { first_name: "Sam", surname: "Doe", class_code: "7A" }
  ]
});

describe("POST /api/auth/register-parent", () => {
  it("400s on wrong user_type", async () => {
    const res = await request(app)
      .post("/api/auth/register-parent")
      .send({ ...validParentPayload(), user_type: "staff" });
    expect(res.status).toBe(400);
  });

  it("400s when parent or students is missing", async () => {
    const res = await request(app)
      .post("/api/auth/register-parent")
      .send({ user_type: "parent" });
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
    const conn = mockConnection();
    mockGetConnection.mockResolvedValueOnce(conn);

    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // school found
      .mockResolvedValueOnce(rows([{ id: 55 }])) // class found
      .mockResolvedValueOnce(rows([])) // email check, clear
      .mockResolvedValueOnce(rows([])) // address check, clear
      .mockResolvedValueOnce(rows([{ id: 4 }])); // pending role id

    conn.query
      .mockResolvedValueOnce([{ insertId: 100 }]) // insert users
      .mockResolvedValueOnce([{ insertId: 200 }]) // insert parents
      .mockResolvedValueOnce([{ insertId: 300 }]) // insert students
      .mockResolvedValueOnce([{}]); // insert student_classes

    const res = await request(app).post("/api/auth/register-parent").send(validParentPayload());

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/Pending approval/);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();

    const studentInsertCall = conn.query.mock.calls[2];
    expect(studentInsertCall[0]).toMatch(/INSERT INTO students/);
    const classLinkCall = conn.query.mock.calls[3];
    expect(classLinkCall[0]).toMatch(/INSERT INTO student_classes/);
    expect(classLinkCall[1]).toEqual([300, 55]);
  });

  it("rolls back and 500s when the insert transaction throws", async () => {
    const conn = mockConnection();
    mockGetConnection.mockResolvedValueOnce(conn);

    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }]))
      .mockResolvedValueOnce(rows([{ id: 55 }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{ id: 4 }]));

    conn.query.mockRejectedValueOnce(new Error("insert failed"));

    const res = await request(app).post("/api/auth/register-parent").send(validParentPayload());

    expect(res.status).toBe(500);
    expect(conn.rollback).toHaveBeenCalled();
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
    const conn = mockConnection();
    mockGetConnection.mockResolvedValueOnce(conn);

    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1 }])) // school found
      .mockResolvedValueOnce(rows([])) // email check, clear
      .mockResolvedValueOnce(rows([{ id: 4 }])); // pending role id

    conn.query
      .mockResolvedValueOnce([{ insertId: 100 }]) // insert users
      .mockResolvedValueOnce([{}]); // insert staff_details

    const res = await request(app).post("/api/auth/register-staff").send(validStaffPayload());

    expect(res.status).toBe(201);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.query.mock.calls[0][0]).toMatch(/INSERT INTO users/);
    expect(conn.query.mock.calls[0][1]).toContain("staff");
    expect(conn.query.mock.calls[1][0]).toMatch(/INSERT INTO staff_details/);
  });
});

describe("POST /api/auth/login", () => {
  it("400s when username or password is missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "jdoe" });
    expect(res.status).toBe(400);
  });

  it("401s when no matching user is found", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "ghost", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid credentials/);
  });

  it("401s when the password does not match", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ id: 1, username: "jdoe", email: "jdoe@x.com", password_hash: "hash", school_id: 1, role: "admin" }])
    );
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "jdoe", password: "wrong" });

    expect(res.status).toBe(401);
  });

  it("logs in successfully and sets an httpOnly cookie", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ id: 1, username: "jdoe", email: "jdoe@x.com", password_hash: "hash", school_id: 1, role: "admin" }])
    );
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "jdoe", password: "Passw0rd!" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Logged in", role: "admin" });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^token=/);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/HttpOnly/i);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the token cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
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
    const { authCookie } = await import("../helpers/auth");
    mockQuery.mockResolvedValueOnce(rows([{ first_name: "Jane", surname: "Doe" }]));

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", authCookie({ userId: 1, role: "parent", schoolId: 1 }));

    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe("Jane Doe");
    expect(res.body.user.userId).toBe(1);
  });

  it("falls back to req.user with fullName:null when the details query fails", async () => {
    const { authCookie } = await import("../helpers/auth");
    mockQuery.mockRejectedValueOnce(new Error("db down"));

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", authCookie({ userId: 1, role: "parent", schoolId: 1 }));

    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(1);
  });
});
