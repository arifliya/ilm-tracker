jest.mock("../../config/db");

import request from "supertest";
import { app } from "../../app";
import { pool } from "../../config/db";
import { rows, mockConnection } from "../helpers/db";
import { authCookie } from "../helpers/auth";

const mockQuery = pool.query as jest.Mock;
const mockGetConnection = pool.getConnection as jest.Mock;

const parentCookie = authCookie({ userId: 1, role: "parent", schoolId: 10 });

describe("GET /api/parent/children", () => {
  it("401s without a cookie", async () => {
    const res = await request(app).get("/api/parent/children");
    expect(res.status).toBe(401);
  });

  it("returns an empty list when the user has no parent row", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/parent/children").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ children: [] });
  });

  it("returns the parent's children", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5 }]))
      .mockResolvedValueOnce(rows([{ id: 1, first_name: "Sam", surname: "Doe" }]));

    const res = await request(app).get("/api/parent/children").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.children).toHaveLength(1);
  });
});

const childPayload = () => ({
  first_name: "Sam",
  surname: "Doe",
  gender: "Male",
  date_of_birth: "2015-01-01",
  address1: "1 Road",
  city: "Town",
  postcode: "AB1 2CD",
  class_code: "7A"
});

describe("POST /api/parent/add-child", () => {
  it("400s when the parent record is missing", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/parent/add-child")
      .set("Cookie", parentCookie)
      .send(childPayload());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Parent not found/);
  });

  it("400s when required fields are missing", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]));
    const res = await request(app)
      .post("/api/parent/add-child")
      .set("Cookie", parentCookie)
      .send({ first_name: "Sam" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Missing required fields/);
  });

  it("400s when class_code is missing", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]));
    const payload = childPayload();
    (payload as any).class_code = "";
    const res = await request(app).post("/api/parent/add-child").set("Cookie", parentCookie).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Class code is required/);
  });

  it("400s when the class code does not exist for the parent's school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/parent/add-child")
      .set("Cookie", parentCookie)
      .send(childPayload());

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid class code/);
  });

  it("adds the child, links them to the class and returns the updated list", async () => {
    const conn = mockConnection();
    mockGetConnection.mockResolvedValueOnce(conn);

    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }])) // parent lookup
      .mockResolvedValueOnce(rows([{ id: 77 }])) // class lookup
      .mockResolvedValueOnce(rows([{ id: 900, first_name: "Sam", surname: "Doe" }])); // final children list

    conn.query
      .mockResolvedValueOnce([{ insertId: 900 }]) // insert student
      .mockResolvedValueOnce([{}]); // insert student_classes

    const res = await request(app)
      .post("/api/parent/add-child")
      .set("Cookie", parentCookie)
      .send(childPayload());

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Child added successfully/);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.query.mock.calls[0][1]).toContain(10); // school_id passed through
    expect(conn.query.mock.calls[1][1]).toEqual([900, 77]);
  });

  it("rolls back and 500s when the transaction throws", async () => {
    const conn = mockConnection();
    mockGetConnection.mockResolvedValueOnce(conn);

    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 77 }]));

    conn.query.mockRejectedValueOnce(new Error("insert failed"));

    const res = await request(app)
      .post("/api/parent/add-child")
      .set("Cookie", parentCookie)
      .send(childPayload());

    expect(res.status).toBe(500);
    expect(conn.rollback).toHaveBeenCalled();
  });
});

describe("GET /api/parent/tasks", () => {
  it("returns an empty list when the user has no parent row", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/parent/tasks").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tasks: [] });
  });

  it("returns tasks across all of the parent's children", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5 }]))
      .mockResolvedValueOnce(rows([{ id: 1, title: "Homework", child_name: "Sam Doe" }]));

    const res = await request(app).get("/api/parent/tasks").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
  });
});
