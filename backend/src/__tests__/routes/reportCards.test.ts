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
let ownerCookie: string;

beforeAll(async () => {
  teacherCookie = await authCookie({ userId: 1, role: "teacher", schoolId: 10 });
  adminCookie = await authCookie({ userId: 2, role: "admin", schoolId: 10 });
  parentCookie = await authCookie({ userId: 3, role: "parent", schoolId: 10 });
  studentCookie = await authCookie({ userId: 4, role: "student", schoolId: 10 });
  ownerCookie = await authCookie({ userId: 5, role: "owner", schoolId: 10 });
});

const validSubjects = [{ subject_name: "Maths", grade: "A", comment: "Great progress" }];

describe("GET /api/report-cards/terms", () => {
  it("403s for a role outside admin/teacher (e.g. owner)", async () => {
    const res = await request(app).get("/api/report-cards/terms").set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("403s for a parent", async () => {
    const res = await request(app).get("/api/report-cards/terms").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("returns terms for the caller's school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, name: "Term 1", start_date: "2026-01-01", end_date: "2026-04-01" }]));
    const res = await request(app).get("/api/report-cards/terms").set("Cookie", teacherCookie);
    expect(res.status).toBe(200);
    expect(res.body.terms).toHaveLength(1);
  });
});

describe("POST /api/report-cards/terms", () => {
  it("403s for a teacher (admin only)", async () => {
    const res = await request(app)
      .post("/api/report-cards/terms")
      .set("Cookie", teacherCookie)
      .send({ name: "Term 1", start_date: "2026-01-01", end_date: "2026-04-01" });
    expect(res.status).toBe(403);
  });

  it("400s when name is missing", async () => {
    const res = await request(app)
      .post("/api/report-cards/terms")
      .set("Cookie", adminCookie)
      .send({ start_date: "2026-01-01", end_date: "2026-04-01" });
    expect(res.status).toBe(400);
  });

  it("400s when end_date is before start_date", async () => {
    const res = await request(app)
      .post("/api/report-cards/terms")
      .set("Cookie", adminCookie)
      .send({ name: "Term 1", start_date: "2026-04-01", end_date: "2026-01-01" });
    expect(res.status).toBe(400);
  });

  it("409s on a duplicate term name for the school", async () => {
    mockQuery.mockRejectedValueOnce({ code: "23505" });
    const res = await request(app)
      .post("/api/report-cards/terms")
      .set("Cookie", adminCookie)
      .send({ name: "Term 1", start_date: "2026-01-01", end_date: "2026-04-01" });
    expect(res.status).toBe(409);
  });

  it("creates a term", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 7 }]));
    const res = await request(app)
      .post("/api/report-cards/terms")
      .set("Cookie", adminCookie)
      .send({ name: "Term 1", start_date: "2026-01-01", end_date: "2026-04-01" });
    expect(res.status).toBe(201);
    expect(res.body.term.id).toBe(7);
  });
});

describe("GET /api/report-cards/students/:studentId", () => {
  it("403s for a role outside admin/teacher/parent (e.g. owner)", async () => {
    const res = await request(app).get("/api/report-cards/students/1").set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("403s for a student (students are never allowed)", async () => {
    const res = await request(app).get("/api/report-cards/students/1").set("Cookie", studentCookie);
    expect(res.status).toBe(403);
  });

  it("404s when the student does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/report-cards/students/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(404);
  });

  it("403s when report cards are disabled for the student's school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).get("/api/report-cards/students/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("403s for a teacher not assigned to the student's class", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([])); // teachesStudent -> false
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/report-cards/students/1").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("403s for a parent who is not this student's parent", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([])); // isOwnChild -> false
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/report-cards/students/1").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("returns an empty list when the student has no report cards yet", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([])); // report_cards -> none
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/report-cards/students/1").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.reportCards).toEqual([]);
  });

  it("returns report cards with nested subjects for the student's own parent", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([{ x: 1 }])) // isOwnChild -> true
      .mockResolvedValueOnce(
        rows([{ id: 100, term_id: 1, term_name: "Term 1", term_start_date: "2026-01-01", term_end_date: "2026-04-01" }])
      )
      .mockResolvedValueOnce(rows([{ id: 1, report_card_id: 100, subject_name: "Maths", grade: "A", comment: null }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).get("/api/report-cards/students/1").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.reportCards).toHaveLength(1);
    expect(res.body.reportCards[0].subjects).toHaveLength(1);
  });
});

describe("POST /api/report-cards/students/:studentId", () => {
  it("403s for a parent (view-only)", async () => {
    const res = await request(app)
      .post("/api/report-cards/students/1")
      .set("Cookie", parentCookie)
      .send({ term_id: 1, subjects: validSubjects });
    expect(res.status).toBe(403);
  });

  it("404s when the student does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/report-cards/students/1")
      .set("Cookie", teacherCookie)
      .send({ term_id: 1, subjects: validSubjects });
    expect(res.status).toBe(404);
  });

  it("403s when report cards are disabled for the school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app)
      .post("/api/report-cards/students/1")
      .set("Cookie", teacherCookie)
      .send({ term_id: 1, subjects: validSubjects });
    expect(res.status).toBe(403);
  });

  it("403s when a teacher does not teach the student", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([])); // teachesStudent -> false
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/report-cards/students/1")
      .set("Cookie", teacherCookie)
      .send({ term_id: 1, subjects: validSubjects });
    expect(res.status).toBe(403);
  });

  it("400s when term_id is missing", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/report-cards/students/1")
      .set("Cookie", adminCookie)
      .send({ subjects: validSubjects });
    expect(res.status).toBe(400);
  });

  it("400s when subjects is empty", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/report-cards/students/1")
      .set("Cookie", adminCookie)
      .send({ term_id: 1, subjects: [] });
    expect(res.status).toBe(400);
  });

  it("400s when a subject is missing a grade", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/report-cards/students/1")
      .set("Cookie", adminCookie)
      .send({ term_id: 1, subjects: [{ subject_name: "Maths" }] });
    expect(res.status).toBe(400);
  });

  it("400s when the term does not belong to the student's school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([])); // term lookup -> none
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/report-cards/students/1")
      .set("Cookie", adminCookie)
      .send({ term_id: 999, subjects: validSubjects });
    expect(res.status).toBe(400);
  });

  it("409s when a report card already exists for this student and term", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }])) // loadStudent
      .mockResolvedValueOnce(rows([{ id: 1 }])) // term lookup -> ok
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockRejectedValueOnce({ code: "23505" }); // insert report_cards
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/report-cards/students/1")
      .set("Cookie", adminCookie)
      .send({ term_id: 1, subjects: validSubjects });

    expect(res.status).toBe(409);
    expect(mockQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("creates a report card with its subjects", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, parent_id: 5 }])) // loadStudent
      .mockResolvedValueOnce(rows([{ x: 1 }])) // teachesStudent -> true
      .mockResolvedValueOnce(rows([{ id: 1 }])) // term lookup -> ok
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockResolvedValueOnce(rows([{ id: 200 }])) // insert report_cards RETURNING id
      .mockResolvedValueOnce(rows([])) // insert report_card_subjects
      .mockResolvedValueOnce(rows([])); // COMMIT
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/report-cards/students/1")
      .set("Cookie", teacherCookie)
      .send({ term_id: 1, subjects: validSubjects });

    expect(res.status).toBe(201);
    expect(res.body.reportCard.id).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith("COMMIT");
  });
});

describe("PUT /api/report-cards/:id", () => {
  it("403s for a parent (view-only)", async () => {
    const res = await request(app).put("/api/report-cards/100").set("Cookie", parentCookie).send({ subjects: validSubjects });
    expect(res.status).toBe(403);
  });

  it("404s when the report card does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).put("/api/report-cards/100").set("Cookie", adminCookie).send({ subjects: validSubjects });
    expect(res.status).toBe(404);
  });

  it("403s when a teacher no longer teaches the student", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 100, student_id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([])); // teachesStudent -> false
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).put("/api/report-cards/100").set("Cookie", teacherCookie).send({ subjects: validSubjects });
    expect(res.status).toBe(403);
  });

  it("replaces the subject list", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 100, student_id: 1, school_id: 10, parent_id: 5 }])) // loadReportCard
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockResolvedValueOnce(rows([])) // delete existing subjects
      .mockResolvedValueOnce(rows([])) // insert new subjects
      .mockResolvedValueOnce(rows([])) // touch updated_at
      .mockResolvedValueOnce(rows([])); // COMMIT
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).put("/api/report-cards/100").set("Cookie", adminCookie).send({ subjects: validSubjects });

    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith("COMMIT");
  });
});

describe("DELETE /api/report-cards/:id", () => {
  it("403s for a parent (view-only)", async () => {
    const res = await request(app).delete("/api/report-cards/100").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("404s when the report card does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).delete("/api/report-cards/100").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("403s when an admin at a different school tries to delete", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 100, student_id: 1, school_id: 99, parent_id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).delete("/api/report-cards/100").set("Cookie", adminCookie);
    expect(res.status).toBe(403);
  });

  it("deletes the report card", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 100, student_id: 1, school_id: 10, parent_id: 5 }]))
      .mockResolvedValueOnce(rows([]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).delete("/api/report-cards/100").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
  });
});
