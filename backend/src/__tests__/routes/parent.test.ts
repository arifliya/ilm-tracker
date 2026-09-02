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
      .mockResolvedValueOnce(rows([])) // guardian_code uniqueness check
      .mockResolvedValueOnce([{ insertId: 900 }]) // insert student
      .mockResolvedValueOnce([{}]) // insert student_guardians
      .mockResolvedValueOnce([{}]); // insert student_classes

    const res = await request(app)
      .post("/api/parent/add-child")
      .set("Cookie", parentCookie)
      .send(childPayload());

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Child added successfully/);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.query.mock.calls[3][1]).toEqual([900, 77]);
  });

  it("rolls back and 500s when the transaction throws", async () => {
    const conn = mockConnection();
    mockGetConnection.mockResolvedValueOnce(conn);

    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 77 }]));

    conn.query
      .mockResolvedValueOnce(rows([])) // guardian_code uniqueness check
      .mockRejectedValueOnce(new Error("insert failed"));

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

describe("GET /api/parent/schedule", () => {
  it("403s when the timetable feature is disabled for the school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).get("/api/parent/schedule").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("returns an empty list when the user has no parent row", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/parent/schedule").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ schedule: [] });
  });

  it("returns each child's slots grouped by student_id", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5 }]))
      .mockResolvedValueOnce(
        rows([
          {
            student_id: 1,
            child_name: "Sam Doe",
            slot_date: new Date("2026-01-15"),
            start_time: "09:00:00",
            end_time: "10:00:00",
            class_name: "7A",
            subject_name: "Maths",
            teacher_first_name: "Daniel",
            teacher_surname: "Foster"
          },
          {
            student_id: 1,
            child_name: "Sam Doe",
            slot_date: new Date("2026-01-16"),
            start_time: "11:00:00",
            end_time: "12:00:00",
            class_name: "7A",
            subject_name: "English",
            teacher_first_name: "",
            teacher_surname: ""
          }
        ])
      );

    const res = await request(app).get("/api/parent/schedule").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.schedule).toHaveLength(1);
    expect(res.body.schedule[0].child_name).toBe("Sam Doe");
    expect(res.body.schedule[0].slots).toHaveLength(2);
  });
});

describe("POST /api/parent/link-guardian", () => {
  it("400s when the parent record is missing", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/parent/link-guardian")
      .set("Cookie", parentCookie)
      .send({ guardian_code: "STUD0001" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Parent not found/);
  });

  it("400s when guardian_code is missing", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]));
    const res = await request(app)
      .post("/api/parent/link-guardian")
      .set("Cookie", parentCookie)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Guardian code is required/);
  });

  it("404s when the guardian code doesn't resolve for this school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/parent/link-guardian")
      .set("Cookie", parentCookie)
      .send({ guardian_code: "BADCODE1" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Invalid guardian code/);
  });

  it("409s when already an approved guardian", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 900 }]))
      .mockResolvedValueOnce(rows([{ status: "approved" }]));

    const res = await request(app)
      .post("/api/parent/link-guardian")
      .set("Cookie", parentCookie)
      .send({ guardian_code: "STUD0001" });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already linked/);
  });

  it("409s when a request is already pending", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 900 }]))
      .mockResolvedValueOnce(rows([{ status: "pending" }]));

    const res = await request(app)
      .post("/api/parent/link-guardian")
      .set("Cookie", parentCookie)
      .send({ guardian_code: "STUD0001" });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already pending/);
  });

  it("submits a pending guardian link request", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 900 }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post("/api/parent/link-guardian")
      .set("Cookie", parentCookie)
      .send({ guardian_code: "STUD0001" });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/Pending admin approval/);
  });
});

describe("GET /api/parent/direct-debit/mandate", () => {
  it("403s when direct_debit is disabled for the school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).get("/api/parent/direct-debit/mandate").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("returns null when no mandate exists yet", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }])).mockResolvedValueOnce(rows([]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/parent/direct-debit/mandate").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.mandate).toBeNull();
  });

  it("returns the mandate's status", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ status: "active", created_at: "2026-01-01", cancelled_at: null }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/parent/direct-debit/mandate").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.mandate.status).toBe("active");
  });
});

describe("POST /api/parent/direct-debit/mandate", () => {
  it("409s when a mandate is already active", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ status: "active" }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).post("/api/parent/direct-debit/mandate").set("Cookie", parentCookie);
    expect(res.status).toBe(409);
  });

  it("creates a new mandate via the stub provider", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([])) // no existing mandate
      .mockResolvedValueOnce([{}]); // INSERT
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).post("/api/parent/direct-debit/mandate").set("Cookie", parentCookie);
    expect(res.status).toBe(201);
    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO payment_mandates"),
      expect.arrayContaining([5])
    );
  });

  it("reactivates a cancelled mandate with fresh provider IDs", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ status: "cancelled" }]))
      .mockResolvedValueOnce([{}]); // UPDATE
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).post("/api/parent/direct-debit/mandate").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("SET status = 'active'"),
      expect.anything()
    );
  });
});

describe("POST /api/parent/direct-debit/mandate/cancel", () => {
  it("404s when there is no active mandate", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }])).mockResolvedValueOnce([{ affectedRows: 0 }]);
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).post("/api/parent/direct-debit/mandate/cancel").set("Cookie", parentCookie);
    expect(res.status).toBe(404);
  });

  it("cancels an active mandate", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 5, school_id: 10 }])).mockResolvedValueOnce([{ affectedRows: 1 }]);
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).post("/api/parent/direct-debit/mandate/cancel").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
  });
});
