jest.mock("../../config/db");
jest.mock("../../utils/featureFlags", () => ({
  isFeatureEnabled: jest.fn()
}));

import request from "supertest";
import { app } from "../../app";
import { pool } from "../../config/db";
import { rows } from "../helpers/db";
import { authCookie } from "../helpers/auth";
import { isFeatureEnabled } from "../../utils/featureFlags";

const mockQuery = pool.query as jest.Mock;
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock;

const teacherCookie = authCookie({ userId: 1, role: "teacher", schoolId: 10 });
const parentCookie = authCookie({ userId: 2, role: "parent", schoolId: 10 });

describe("GET /api/teacher/classes", () => {
  it("403s for a non-teacher role", async () => {
    const res = await request(app).get("/api/teacher/classes").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("returns the teacher's classes", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, class_name: "7A" }]));
    const res = await request(app).get("/api/teacher/classes").set("Cookie", teacherCookie);
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(1);
  });
});

describe("GET /api/teacher/attendance/report", () => {
  it("403s when the feature is disabled", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app)
      .get("/api/teacher/attendance/report?classId=1")
      .set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("400s when classId is missing", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/teacher/attendance/report").set("Cookie", teacherCookie);
    expect(res.status).toBe(400);
  });

  it("403s when the teacher does not own the class", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([])); // ownsClass -> false

    const res = await request(app)
      .get("/api/teacher/attendance/report?classId=1")
      .set("Cookie", teacherCookie);

    expect(res.status).toBe(403);
  });

  it("streams a CSV for an owned class", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ x: 1 }])) // ownsClass -> true
      .mockResolvedValueOnce(
        rows([{ date: "2026-01-01", first_name: "Sam", surname: "Doe", class_name: "7A", status: "ABSENT" }])
      );

    const res = await request(app)
      .get("/api/teacher/attendance/report?classId=1")
      .set("Cookie", teacherCookie);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain("Sam,Doe,7A,Absent");
  });
});

describe("GET /api/teacher/attendance/:classId", () => {
  it("400s on an invalid date query param", async () => {
    const res = await request(app)
      .get("/api/teacher/attendance/1?date=not-a-date")
      .set("Cookie", teacherCookie);
    expect(res.status).toBe(400);
  });

  it("403s when the teacher does not own the class", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/teacher/attendance/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("returns the class register defaulting to today", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ x: 1 }])) // ownsClass
      .mockResolvedValueOnce(rows([{ id: 1, first_name: "Sam", attendance_status: null }]));

    const res = await request(app).get("/api/teacher/attendance/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.date).toBeTruthy();
  });
});

describe("GET /api/teacher/attendance/:classId/history", () => {
  it("403s when the teacher does not own the class", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/teacher/attendance/1/history").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("returns per-day attendance summaries", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ x: 1 }]))
      .mockResolvedValueOnce(rows([{ date: "2026-01-01", present_count: 5, absent_count: 1, total_count: 6 }]));

    const res = await request(app).get("/api/teacher/attendance/1/history").set("Cookie", teacherCookie);
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
  });
});

describe("POST /api/teacher/attendance/mark", () => {
  it("400s when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/teacher/attendance/mark")
      .set("Cookie", teacherCookie)
      .send({ classId: 1 });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid status", async () => {
    const res = await request(app)
      .post("/api/teacher/attendance/mark")
      .set("Cookie", teacherCookie)
      .send({ classId: 1, studentId: 2, status: "MAYBE" });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid date", async () => {
    const res = await request(app)
      .post("/api/teacher/attendance/mark")
      .set("Cookie", teacherCookie)
      .send({ classId: 1, studentId: 2, status: "present", date: "bad-date" });
    expect(res.status).toBe(400);
  });

  it("403s when the teacher does not own the class", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/teacher/attendance/mark")
      .set("Cookie", teacherCookie)
      .send({ classId: 1, studentId: 2, status: "present" });
    expect(res.status).toBe(403);
  });

  it("marks attendance, normalizing status to uppercase", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ x: 1 }])).mockResolvedValueOnce(rows({}));

    const res = await request(app)
      .post("/api/teacher/attendance/mark")
      .set("Cookie", teacherCookie)
      .send({ classId: 1, studentId: 2, status: "present" });

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[1][1]).toEqual([1, 2, expect.any(String), "PRESENT"]);
  });
});

describe("POST /api/teacher/tasks/create", () => {
  it("403s when the teacher does not own the class", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/teacher/tasks/create")
      .set("Cookie", teacherCookie)
      .send({ classId: 1, title: "HW" });
    expect(res.status).toBe(403);
  });

  it("creates a class-wide task", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ x: 1 }])).mockResolvedValueOnce(rows({}));

    const res = await request(app)
      .post("/api/teacher/tasks/create")
      .set("Cookie", teacherCookie)
      .send({ classId: 1, title: "HW", description: "Read", due_date: "2026-02-01" });

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[1][1]).toEqual([1, null, "HW", "Read", "2026-02-01"]);
  });

  it("403s when independent homework (student_notes) is disabled", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ x: 1 }])); // ownsClass
    mockIsFeatureEnabled.mockResolvedValueOnce(false);

    const res = await request(app)
      .post("/api/teacher/tasks/create")
      .set("Cookie", teacherCookie)
      .send({ classId: 1, title: "HW", studentId: 5 });

    expect(res.status).toBe(403);
  });

  it("400s when the student is not in the class", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ x: 1 }])) // ownsClass
      .mockResolvedValueOnce(rows([])); // student not in class
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/teacher/tasks/create")
      .set("Cookie", teacherCookie)
      .send({ classId: 1, title: "HW", studentId: 5 });

    expect(res.status).toBe(400);
  });

  it("creates an independent task for one student", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ x: 1 }])) // ownsClass
      .mockResolvedValueOnce(rows([{ x: 1 }])) // student in class
      .mockResolvedValueOnce(rows({})); // insert
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/teacher/tasks/create")
      .set("Cookie", teacherCookie)
      .send({ classId: 1, title: "HW", studentId: 5 });

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[2][1]).toEqual([1, 5, "HW", undefined, undefined]);
  });
});

describe("DELETE /api/teacher/tasks/:id", () => {
  it("403s when the teacher is not assigned to the task's class", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).delete("/api/teacher/tasks/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("deletes the task", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1 }])).mockResolvedValueOnce(rows({}));
    const res = await request(app).delete("/api/teacher/tasks/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/teacher/classes/:classId/students/:studentId/parent-contacts", () => {
  it("403s when the teacher does not own the class", async () => {
    mockQuery.mockResolvedValueOnce(rows([])); // ownsClass -> false

    const res = await request(app)
      .get("/api/teacher/classes/1/students/5/parent-contacts")
      .set("Cookie", teacherCookie);

    expect(res.status).toBe(403);
  });

  it("400s when the student is not in the class", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ x: 1 }])) // ownsClass
      .mockResolvedValueOnce(rows([])); // student not in class

    const res = await request(app)
      .get("/api/teacher/classes/1/students/5/parent-contacts")
      .set("Cookie", teacherCookie);

    expect(res.status).toBe(400);
  });

  it("returns approved guardians and logs a view", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ x: 1 }])) // ownsClass
      .mockResolvedValueOnce(rows([{ x: 1 }])) // student in class
      .mockResolvedValueOnce(
        rows([
          {
            first_name: "Aisha",
            middle_name: null,
            surname: "Khan",
            relationship_to_student: "mother",
            contact_number: "07123456789",
            email: "aisha.khan@example.com"
          }
        ])
      ) // guardian query
      .mockResolvedValueOnce(rows({})); // audit insert

    const res = await request(app)
      .get("/api/teacher/classes/1/students/5/parent-contacts")
      .set("Cookie", teacherCookie);

    expect(res.status).toBe(200);
    expect(res.body.guardians).toHaveLength(1);
    expect(res.body.guardians[0].email).toBe("aisha.khan@example.com");

    expect(mockQuery.mock.calls[3][0]).toContain("INSERT INTO parent_contact_view_log");
    expect(mockQuery.mock.calls[3][1]).toEqual([1, 5, 1, 10]);
  });
});

describe("GET /api/teacher/tasks", () => {
  it("returns the teacher's tasks", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, title: "HW" }]));
    const res = await request(app).get("/api/teacher/tasks").set("Cookie", teacherCookie);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
  });
});
