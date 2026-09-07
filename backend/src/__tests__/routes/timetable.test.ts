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

let adminCookie: string;
let ownerCookie: string;
let teacherCookie: string;
let parentCookie: string;

beforeAll(async () => {
  adminCookie = await authCookie({ userId: 1, role: "admin", schoolId: 10 });
  ownerCookie = await authCookie({ userId: 2, role: "owner", schoolId: 10 });
  teacherCookie = await authCookie({ userId: 3, role: "teacher", schoolId: 10 });
  parentCookie = await authCookie({ userId: 4, role: "parent", schoolId: 10 });
});

const validSlot = { slot_date: "2026-01-15", start_time: "09:00", end_time: "10:00", subject_name: "Maths" };

describe("GET /api/timetable/terms", () => {
  it("403s for a role outside admin/owner/parent (e.g. teacher)", async () => {
    const res = await request(app).get("/api/timetable/terms").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("returns terms for the caller's school even when the timetable flag is off", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, name: "Term 1", start_date: "2026-01-01", end_date: "2026-04-01" }]));
    const res = await request(app).get("/api/timetable/terms").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.terms).toHaveLength(1);
  });

  it("200s for a parent", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, name: "Term 1", start_date: "2026-01-01", end_date: "2026-04-01" }]));
    const res = await request(app).get("/api/timetable/terms").set("Cookie", parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.terms).toHaveLength(1);
  });
});

describe("POST /api/timetable/terms", () => {
  it("403s for a teacher", async () => {
    const res = await request(app)
      .post("/api/timetable/terms")
      .set("Cookie", teacherCookie)
      .send({ name: "Term 1", start_date: "2026-01-01", end_date: "2026-04-01" });
    expect(res.status).toBe(403);
  });

  it("400s when name is missing", async () => {
    const res = await request(app)
      .post("/api/timetable/terms")
      .set("Cookie", adminCookie)
      .send({ start_date: "2026-01-01", end_date: "2026-04-01" });
    expect(res.status).toBe(400);
  });

  it("400s when end_date is before start_date", async () => {
    const res = await request(app)
      .post("/api/timetable/terms")
      .set("Cookie", ownerCookie)
      .send({ name: "Term 1", start_date: "2026-04-01", end_date: "2026-01-01" });
    expect(res.status).toBe(400);
  });

  it("409s on a duplicate term name for the school", async () => {
    mockQuery.mockRejectedValueOnce({ code: "23505" });
    const res = await request(app)
      .post("/api/timetable/terms")
      .set("Cookie", adminCookie)
      .send({ name: "Term 1", start_date: "2026-01-01", end_date: "2026-04-01" });
    expect(res.status).toBe(409);
  });

  it("creates a term (owner can, unlike report-cards' admin-only terms)", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 7 }]));
    const res = await request(app)
      .post("/api/timetable/terms")
      .set("Cookie", ownerCookie)
      .send({ name: "Term 1", start_date: "2026-01-01", end_date: "2026-04-01" });
    expect(res.status).toBe(201);
    expect(res.body.term.id).toBe(7);
  });
});

describe("GET /api/timetable/slots", () => {
  it("403s for a role outside admin/owner (e.g. teacher)", async () => {
    const res = await request(app).get("/api/timetable/slots?term_id=1").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("403s when timetable is disabled for the school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).get("/api/timetable/slots?term_id=1").set("Cookie", adminCookie);
    expect(res.status).toBe(403);
  });

  it("400s when term_id is missing", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/timetable/slots").set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });

  it("400s when term_id doesn't belong to this school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([])); // validateTerm -> false
    const res = await request(app).get("/api/timetable/slots?term_id=999").set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });

  it("returns every class's slots for the term", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ x: 1 }])) // validateTerm -> true
      .mockResolvedValueOnce(
        rows([
          { id: 1, class_id: 1, class_name: "Year 7A", term_id: 1, slot_date: "2026-01-15", start_time: "09:00:00", end_time: "10:00:00", subject_name: "Maths" },
          { id: 2, class_id: 2, class_name: "Year 8B", term_id: 1, slot_date: "2026-01-15", start_time: "09:00:00", end_time: "10:00:00", subject_name: "English" }
        ])
      );
    const res = await request(app).get("/api/timetable/slots?term_id=1").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(2);
  });
});

describe("GET /api/timetable/classes/:classId/slots", () => {
  it("403s for a role outside admin/owner (e.g. teacher)", async () => {
    const res = await request(app).get("/api/timetable/classes/1/slots").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("404s when the class does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/timetable/classes/1/slots").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("403s when the class is at a different school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 99 }]));
    const res = await request(app).get("/api/timetable/classes/1/slots").set("Cookie", adminCookie);
    expect(res.status).toBe(403);
  });

  it("403s when timetable is disabled for the school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).get("/api/timetable/classes/1/slots").set("Cookie", adminCookie);
    expect(res.status).toBe(403);
  });

  it("returns every slot for the class across every term when term_id is omitted", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(
        rows([{ id: 1, term_id: 1, term_name: "Term 1", slot_date: "2026-01-15", start_time: "09:00:00", end_time: "10:00:00", subject_name: "Maths" }])
      );
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/timetable/classes/1/slots").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(1);
  });

  it("400s when term_id is provided but doesn't belong to this school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10 }])).mockResolvedValueOnce(rows([])); // validateTerm -> false
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/timetable/classes/1/slots?term_id=999").set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });

  it("filters by term_id when provided", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ x: 1 }])) // validateTerm -> true
      .mockResolvedValueOnce(
        rows([{ id: 1, term_id: 1, term_name: "Term 1", slot_date: "2026-01-15", start_time: "09:00:00", end_time: "10:00:00", subject_name: "Maths" }])
      );
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/timetable/classes/1/slots?term_id=1").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(1);
  });
});

describe("POST /api/timetable/classes/:classId/slots", () => {
  it("403s for a teacher", async () => {
    const res = await request(app).post("/api/timetable/classes/1/slots").set("Cookie", teacherCookie).send(validSlot);
    expect(res.status).toBe(403);
  });

  it("404s when the class does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/timetable/classes/1/slots").set("Cookie", adminCookie).send(validSlot);
    expect(res.status).toBe(404);
  });

  it("403s when timetable is disabled", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).post("/api/timetable/classes/1/slots").set("Cookie", adminCookie).send(validSlot);
    expect(res.status).toBe(403);
  });

  it("400s on an invalid slot_date", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/timetable/classes/1/slots")
      .set("Cookie", adminCookie)
      .send({ ...validSlot, slot_date: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("400s when end_time is not after start_time", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/timetable/classes/1/slots")
      .set("Cookie", adminCookie)
      .send({ ...validSlot, start_time: "10:00", end_time: "09:00" });
    expect(res.status).toBe(400);
  });

  it("creates a slot without a subject_name (optional)", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 1 }])) // resolveTermForDate -> term 1
      .mockResolvedValueOnce(rows([{ id: 6 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const { subject_name: _s, ...withoutSubject } = validSlot;
    const res = await request(app).post("/api/timetable/classes/1/slots").set("Cookie", adminCookie).send(withoutSubject);
    expect(res.status).toBe(201);
  });

  it("400s when no term covers slot_date", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10 }])).mockResolvedValueOnce(rows([])); // resolveTermForDate -> none
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).post("/api/timetable/classes/1/slots").set("Cookie", adminCookie).send(validSlot);
    expect(res.status).toBe(400);
  });

  it("400s when teacher_id is not a teacher at this school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 1 }])) // resolveTermForDate -> term 1
      .mockResolvedValueOnce(rows([])); // validateTeacher -> false
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/timetable/classes/1/slots")
      .set("Cookie", adminCookie)
      .send({ ...validSlot, teacher_id: 55 });
    expect(res.status).toBe(400);
  });

  it("409s on a duplicate slot", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 1 }])) // resolveTermForDate -> term 1
      .mockRejectedValueOnce({ code: "23505" });
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).post("/api/timetable/classes/1/slots").set("Cookie", adminCookie).send(validSlot);
    expect(res.status).toBe(409);
  });

  it("creates a slot, resolving the term automatically from slot_date", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 4 }])) // resolveTermForDate -> term 4
      .mockResolvedValueOnce(rows([{ id: 5 }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).post("/api/timetable/classes/1/slots").set("Cookie", ownerCookie).send(validSlot);
    expect(res.status).toBe(201);
    expect(res.body.slot.id).toBe(5);
    expect(res.body.slot.term_id).toBe(4);
  });
});

describe("PUT /api/timetable/slots/:id", () => {
  it("404s when the slot does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).put("/api/timetable/slots/1").set("Cookie", adminCookie).send(validSlot);
    expect(res.status).toBe(404);
  });

  it("403s when the slot's class is at a different school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 99 }]));
    const res = await request(app).put("/api/timetable/slots/1").set("Cookie", adminCookie).send(validSlot);
    expect(res.status).toBe(403);
  });

  it("400s when no term covers the new slot_date", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, class_id: 1, school_id: 10 }])).mockResolvedValueOnce(rows([])); // resolveTermForDate -> none
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).put("/api/timetable/slots/1").set("Cookie", adminCookie).send(validSlot);
    expect(res.status).toBe(400);
  });

  it("updates the slot, re-resolving the term from the new date", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, class_id: 1, school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 2 }])) // resolveTermForDate -> term 2
      .mockResolvedValueOnce(rows([]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).put("/api/timetable/slots/1").set("Cookie", adminCookie).send(validSlot);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/timetable/slots/:id", () => {
  it("404s when the slot does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).delete("/api/timetable/slots/1").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("deletes the slot", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10 }])).mockResolvedValueOnce(rows([]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).delete("/api/timetable/slots/1").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/timetable/events", () => {
  it("403s for a teacher", async () => {
    const res = await request(app).get("/api/timetable/events").set("Cookie", teacherCookie);
    expect(res.status).toBe(403);
  });

  it("returns events for the caller's school even when the timetable flag is off", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, title: "INSET Day", event_date: "2026-09-01" }]));
    const res = await request(app).get("/api/timetable/events").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
  });
});

describe("POST /api/timetable/events", () => {
  it("400s when title is missing", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/timetable/events")
      .set("Cookie", adminCookie)
      .send({ event_date: "2026-09-01" });
    expect(res.status).toBe(400);
  });

  it("400s when event_date is missing", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).post("/api/timetable/events").set("Cookie", adminCookie).send({ title: "INSET Day" });
    expect(res.status).toBe(400);
  });

  it("400s when end_time is not after start_time", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/timetable/events")
      .set("Cookie", adminCookie)
      .send({ title: "INSET Day", event_date: "2026-09-01", start_time: "14:00", end_time: "13:00" });
    expect(res.status).toBe(400);
  });

  it("creates an event", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 9 }]));
    const res = await request(app)
      .post("/api/timetable/events")
      .set("Cookie", adminCookie)
      .send({ title: "INSET Day", event_date: "2026-09-01" });
    expect(res.status).toBe(201);
    expect(res.body.event.id).toBe(9);
  });
});

describe("PUT /api/timetable/events/:id", () => {
  it("404s when the event does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .put("/api/timetable/events/1")
      .set("Cookie", adminCookie)
      .send({ title: "Updated", event_date: "2026-09-01" });
    expect(res.status).toBe(404);
  });

  it("403s when the event is at a different school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 99 }]));
    const res = await request(app)
      .put("/api/timetable/events/1")
      .set("Cookie", adminCookie)
      .send({ title: "Updated", event_date: "2026-09-01" });
    expect(res.status).toBe(403);
  });

  it("updates the event", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10 }])).mockResolvedValueOnce(rows([]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .put("/api/timetable/events/1")
      .set("Cookie", adminCookie)
      .send({ title: "Updated", event_date: "2026-09-01" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/timetable/events/:id", () => {
  it("404s when the event does not exist", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).delete("/api/timetable/events/1").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("deletes the event", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10 }])).mockResolvedValueOnce(rows([]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).delete("/api/timetable/events/1").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
  });
});
