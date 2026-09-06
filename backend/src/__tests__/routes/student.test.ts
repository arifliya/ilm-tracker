jest.mock("../../config/db");

import app from "../../app";
import { rows } from "../helpers/db";
import { authCookie } from "../helpers/auth";
import { request } from "../helpers/request";

const { mockDb } = jest.requireMock<typeof import("../../config/__mocks__/db")>("../../config/db");
const mockQuery = mockDb.query as jest.Mock;

let studentCookie: string;
let teacherCookie: string;

beforeAll(async () => {
  studentCookie = await authCookie({ userId: 1, role: "student", schoolId: 10 });
  teacherCookie = await authCookie({ userId: 2, role: "teacher", schoolId: 10 });
});

describe("GET /api/student/classes", () => {
  it("403s for a non-student role", async () => {
    const res = await request(app).get("/api/student/classes").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("returns the classes the student is enrolled in", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, class_name: "7A" }]));
    const res = await request(app).get("/api/student/classes").set("Cookie", studentCookie);
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(1);
  });
});

describe("GET /api/student/tasks", () => {
  it("401s without a cookie", async () => {
    const res = await request(app).get("/api/student/tasks");
    expect(res.status).toBe(401);
  });

  it("returns tasks for the student's class, including independent ones", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ id: 1, title: "HW", is_independent: 0 }, { id: 2, title: "Solo HW", is_independent: 1 }])
    );

    const res = await request(app).get("/api/student/tasks").set("Cookie", studentCookie);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(2);
  });
});
