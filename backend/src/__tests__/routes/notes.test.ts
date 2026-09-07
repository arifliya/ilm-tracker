jest.mock("../../config/db");
jest.mock("../../utils/featureFlags", () => ({
  isFeatureEnabled: jest.fn()
}));

import app from "../../app";
import { rows } from "../helpers/db";
import { authCookie } from "../helpers/auth";
import { request } from "../helpers/request";
import { isFeatureEnabled } from "../../utils/featureFlags";

const { mockDb } = jest.requireMock<typeof import("../../config/__mocks__/db")>("../../config/db");
const mockQuery = mockDb.query as jest.Mock;
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock;

let teacherCookie: string;
let adminCookie: string;
let parentCookie: string;
let studentCookie: string;

beforeAll(async () => {
  teacherCookie = await authCookie({ userId: 1, role: "teacher", schoolId: 10 });
  adminCookie = await authCookie({ userId: 2, role: "admin", schoolId: 10 });
  parentCookie = await authCookie({ userId: 3, role: "parent", schoolId: 10 });
  studentCookie = await authCookie({ userId: 4, role: "student", schoolId: 10 });
});

describe("GET /api/notes/students/:studentId", () => {
  it("404s when the student does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/notes/students/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(404);
  });

  it("403s when notes are disabled for the student's school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(false);

    const res = await request(app).get("/api/notes/students/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("403s for staff at a different school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 99, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).get("/api/notes/students/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("403s for a student (students are never allowed)", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).get("/api/notes/students/1").set("Cookie", studentCookie);
    expect(res.status).toBe(403);
  });

  it("403s for a parent who is not this student's parent", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([])); // isOwnChild -> false
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).get("/api/notes/students/1").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("returns notes for staff at the same school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([{ id: 1, note: "Doing well" }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).get("/api/notes/students/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
  });

  it("returns notes for the student's own parent", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([{ x: 1 }])) // isOwnChild -> true
      .mockResolvedValueOnce(rows([{ id: 1, note: "Doing well" }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).get("/api/notes/students/1").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
  });
});

describe("POST /api/notes/students/:studentId", () => {
  it("403s for a role outside STAFF_ROLES (e.g. parent)", async () => {
    const res = await request(app)
      .post("/api/notes/students/1")
      .set("Cookie", parentCookie)
      .send({ note: "Great progress" });
    expect(res.status).toBe(403);
  });

  it("400s when note text is missing", async () => {
    const res = await request(app).post("/api/notes/students/1").set("Cookie", teacherCookie).send({});
    expect(res.status).toBe(400);
  });

  it("404s when the student does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/notes/students/1")
      .set("Cookie", teacherCookie)
      .send({ note: "Great progress" });
    expect(res.status).toBe(404);
  });

  it("403s when notes are disabled for the school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(false);

    const res = await request(app)
      .post("/api/notes/students/1")
      .set("Cookie", teacherCookie)
      .send({ note: "Great progress" });
    expect(res.status).toBe(403);
  });

  it("403s when the student is at a different school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 99, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/notes/students/1")
      .set("Cookie", teacherCookie)
      .send({ note: "Great progress" });
    expect(res.status).toBe(403);
  });

  it("403s when a teacher is not assigned to the student's class", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([])); // teachesStudent -> false
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/notes/students/1")
      .set("Cookie", teacherCookie)
      .send({ note: "Great progress" });
    expect(res.status).toBe(403);
  });

  it("adds the note when a teacher teaches the student", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([{ x: 1 }])) // teachesStudent -> true
      .mockResolvedValueOnce(rows([]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/notes/students/1")
      .set("Cookie", teacherCookie)
      .send({ note: "Great progress" });

    expect(res.status).toBe(201);
  });

  it("adds the note for non-teacher staff without a class-ownership check", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/notes/students/1")
      .set("Cookie", adminCookie)
      .send({ note: "Great progress" });

    expect(res.status).toBe(201);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});
