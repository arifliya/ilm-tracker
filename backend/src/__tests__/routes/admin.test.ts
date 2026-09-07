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
let sysAdminCookie: string;
let parentCookie: string;
let maintainerCookie: string;

beforeAll(async () => {
  adminCookie = await authCookie({ userId: 1, role: "admin", schoolId: 10 });
  ownerCookie = await authCookie({ userId: 2, role: "owner", schoolId: 10 });
  sysAdminCookie = await authCookie({ userId: 3, role: "system_admin", schoolId: null });
  parentCookie = await authCookie({ userId: 4, role: "parent", schoolId: 10 });
  maintainerCookie = await authCookie({ userId: 5, role: "maintainer", schoolId: 10 });
});

// Mirrors admin.ts's own todayStr/daysAgoStr (not exported) so date-range
// assertions stay correct regardless of what day the suite runs.
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("GET /api/admin/classes", () => {
  it("401s without a cookie", async () => {
    const res = await request(app).get("/api/admin/classes");
    expect(res.status).toBe(401);
  });

  it("403s for a role outside STAFF_MGMT", async () => {
    const res = await request(app).get("/api/admin/classes").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("scopes the query to the requester's school for admin", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1 }]));
    const res = await request(app).get("/api/admin/classes").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).toMatch(/WHERE c.school_id = \$1/);
    expect(mockQuery.mock.calls[0][1]).toEqual([10]);
  });

  it("does not scope the query for system_admin", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/admin/classes").set("Cookie", sysAdminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/WHERE/);
    expect(mockQuery.mock.calls[0][1]).toEqual([]);
  });
});

describe("POST /api/admin/classes", () => {
  it("400s when class_name is missing", async () => {
    const res = await request(app)
      .post("/api/admin/classes")
      .set("Cookie", adminCookie)
      .send({ class_code: "7A" });
    expect(res.status).toBe(400);
  });

  it("400s when class_code is missing", async () => {
    const res = await request(app)
      .post("/api/admin/classes")
      .set("Cookie", adminCookie)
      .send({ class_name: "Class 7A" });
    expect(res.status).toBe(400);
  });

  it("400s for system_admin when school_id is not provided", async () => {
    const res = await request(app)
      .post("/api/admin/classes")
      .set("Cookie", sysAdminCookie)
      .send({ class_name: "Class 7A", class_code: "7A" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/School is required/);
  });

  it("400s when the school is not found", async () => {
    mockQuery.mockResolvedValueOnce(rows([])); // getSchoolCode -> none
    const res = await request(app)
      .post("/api/admin/classes")
      .set("Cookie", adminCookie)
      .send({ class_name: "Class 7A", class_code: "7A" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/School not found/);
  });

  it("creates a class with a school-prefixed code", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_code: "ILM2026" }])) // getSchoolCode
      .mockResolvedValueOnce(rows([])); // insert

    const res = await request(app)
      .post("/api/admin/classes")
      .set("Cookie", adminCookie)
      .send({ class_name: "Class 7A", class_code: "7A", year_group: "7" });

    expect(res.status).toBe(200);
    expect(res.body.class_code).toBe("ILM2026-7A");
    expect(mockQuery.mock.calls[1][1]).toEqual([10, "Class 7A", "ILM2026-7A", "7", null]);
  });

  it("409s on a duplicate class code", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_code: "ILM2026" }]));
    mockQuery.mockRejectedValueOnce({ code: "23505" });

    const res = await request(app)
      .post("/api/admin/classes")
      .set("Cookie", adminCookie)
      .send({ class_name: "Class 7A", class_code: "7A" });

    expect(res.status).toBe(409);
  });
});

describe("PUT /api/admin/classes/:id", () => {
  it("404s when the class is out of the requester's school scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 99 }])); // getClassSchoolId, different school
    const res = await request(app)
      .put("/api/admin/classes/5")
      .set("Cookie", adminCookie)
      .send({ class_name: "X", class_code: "7A" });
    expect(res.status).toBe(404);
  });

  it("updates and rebuilds the full class code", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // getClassSchoolId
      .mockResolvedValueOnce(rows([{ school_code: "ILM2026" }])) // getSchoolCode
      .mockResolvedValueOnce(rows([])); // update

    const res = await request(app)
      .put("/api/admin/classes/5")
      .set("Cookie", adminCookie)
      .send({ class_name: "Class 7A", class_code: "7B" });

    expect(res.status).toBe(200);
    expect(res.body.class_code).toBe("ILM2026-7B");
  });
});

describe("DELETE /api/admin/classes/:id", () => {
  it("404s when out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 99 }]));
    const res = await request(app).delete("/api/admin/classes/5").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("deletes relations then the class", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app).delete("/api/admin/classes/5").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[1][0]).toMatch(/DELETE FROM teacher_classes/);
    expect(mockQuery.mock.calls[2][0]).toMatch(/DELETE FROM student_classes/);
    expect(mockQuery.mock.calls[3][0]).toMatch(/DELETE FROM classes/);
  });
});

describe("POST /api/admin/classes/:id/assign-teacher", () => {
  it("400s when teacherUserId is missing", async () => {
    const res = await request(app)
      .post("/api/admin/classes/5/assign-teacher")
      .set("Cookie", adminCookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("400s when the teacher belongs to a different school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // class school
      .mockResolvedValueOnce(rows([{ school_id: 99 }])); // teacher school

    const res = await request(app)
      .post("/api/admin/classes/5/assign-teacher")
      .set("Cookie", adminCookie)
      .send({ teacherUserId: 7 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not belong/);
  });

  it("assigns the teacher when everything checks out", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/admin/classes/5/assign-teacher")
      .set("Cookie", adminCookie)
      .send({ teacherUserId: 7 });

    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/classes/:id/remove-teacher", () => {
  it("400s when teacherUserId is missing", async () => {
    const res = await request(app)
      .post("/api/admin/classes/5/remove-teacher")
      .set("Cookie", adminCookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("removes the teacher from the class", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10 }])).mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/admin/classes/5/remove-teacher")
      .set("Cookie", adminCookie)
      .send({ teacherUserId: 7 });

    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/classes/:id/assign-student", () => {
  it("400s when studentId is missing", async () => {
    const res = await request(app)
      .post("/api/admin/classes/5/assign-student")
      .set("Cookie", adminCookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("400s when the student belongs to a different school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ school_id: 99 }]));

    const res = await request(app)
      .post("/api/admin/classes/5/assign-student")
      .set("Cookie", adminCookie)
      .send({ studentId: 8 });

    expect(res.status).toBe(400);
  });

  it("assigns the student", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/admin/classes/5/assign-student")
      .set("Cookie", adminCookie)
      .send({ studentId: 8 });

    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/classes/:id/remove-student", () => {
  it("removes the student from the class", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10 }])).mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/admin/classes/5/remove-student")
      .set("Cookie", adminCookie)
      .send({ studentId: 8 });

    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/teachers", () => {
  it("returns the plain array (dropdown mode) when no page/pageSize is given", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          total_count: "2",
          teacher_id: 1,
          username: "t1",
          email: "t1@x.com",
          first_name: "Tara",
          surname: "One",
          assigned_classes: [
            { id: 5, class_name: "7A", year_group: "7" },
            { id: 6, class_name: "7B", year_group: "7" }
          ]
        },
        { total_count: "2", teacher_id: 2, username: "t2", email: "t2@x.com", first_name: null, surname: null, assigned_classes: [] }
      ])
    );

    const res = await request(app).get("/api/admin/teachers").set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].assigned_classes).toHaveLength(2);
    expect(res.body[1].assigned_classes).toHaveLength(0);
    // Dropdown mode never paginates — no LIMIT/OFFSET in the query.
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/LIMIT/);
  });

  it("falls back to JSON.parse if assigned_classes comes back as a raw string", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          total_count: "1",
          teacher_id: 1,
          username: "t1",
          email: "t1@x.com",
          first_name: "Tara",
          surname: "One",
          assigned_classes: JSON.stringify([{ id: 5, class_name: "7A", year_group: "7" }])
        }
      ])
    );

    const res = await request(app).get("/api/admin/teachers").set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body[0].assigned_classes).toEqual([{ id: 5, class_name: "7A", year_group: "7" }]);
  });

  it("returns { teachers, total } and applies page/pageSize/search/sort when given", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .get("/api/admin/teachers?page=1&pageSize=5&search=tar&sort=za")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ teachers: [], total: 0 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY u\.username DESC/);
    expect(sql).toMatch(/LIMIT \$3 OFFSET \$4/);
    // school scope, then the ILIKE pattern, then LIMIT then OFFSET.
    expect(params).toEqual([10, "%tar%", 5, 5]);
  });
});

describe("DELETE /api/admin/teachers/:id", () => {
  it("404s when the teacher is out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([])); // getUserSchoolId -> null
    const res = await request(app).delete("/api/admin/teachers/7").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("removes the teacher and dependencies", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // getUserSchoolId
      .mockResolvedValueOnce(rows([])) // parents lookup (none)
      .mockResolvedValueOnce(rows([])) // delete staff_details
      .mockResolvedValueOnce(rows([])) // delete teacher_classes
      .mockResolvedValueOnce(rows([])) // update students set user_id null
      .mockResolvedValueOnce(rows([])); // delete users

    const res = await request(app).delete("/api/admin/teachers/7").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/students-parents", () => {
  it("returns the joined overview as a plain array (dropdown mode) when no page/pageSize is given", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ total_count: "1", student_id: 1, guardians: [{ parent_id: 9, first_name: "Sam" }] }])
    );
    const res = await request(app).get("/api/admin/students-parents").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ student_id: 1, guardians: [{ parent_id: 9, first_name: "Sam" }] }]);
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/LIMIT/);
  });

  it("falls back to JSON.parse if guardians comes back as a raw string", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ total_count: "1", student_id: 1, guardians: JSON.stringify([{ parent_id: 9, first_name: "Sam" }]) }])
    );
    const res = await request(app).get("/api/admin/students-parents").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ student_id: 1, guardians: [{ parent_id: 9, first_name: "Sam" }] }]);
  });

  it("returns { studentsParents, total } and applies page/pageSize when given, matching student or guardian name on search", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .get("/api/admin/students-parents?page=1&pageSize=5&search=sam&sort=za")
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ studentsParents: [], total: 0 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY s\.first_name DESC, s\.surname DESC/);
    expect(sql).toMatch(/EXISTS \(/);
    expect(sql).toMatch(/LIMIT \$3 OFFSET \$4/);
    // school scope, then one ILIKE pattern reused 4x in the SQL text
    // (student first/surname, guardian first/surname — same placeholder,
    // not four separate params), then LIMIT then OFFSET.
    expect(params).toEqual([10, "%sam%", 5, 5]);
  });
});

describe("GET /api/admin/parents", () => {
  it("returns parents (including those with zero students) as a plain array when no page/pageSize is given", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ total_count: "1", parent_id: 1, student_count: 0 }]));
    const res = await request(app).get("/api/admin/parents").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ parent_id: 1, student_count: 0 }]);
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/LIMIT/);
  });

  it("returns { parents, total } and applies page/pageSize/search/sort when given", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .get("/api/admin/parents?page=0&pageSize=5&search=doe&sort=za")
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ parents: [], total: 0 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY p\.surname DESC, p\.first_name DESC/);
    expect(sql).toMatch(/LIMIT \$3 OFFSET \$4/);
    expect(params).toEqual([10, "%doe%", 5, 0]);
  });
});

describe("GET /api/admin/assigned-students", () => {
  it("returns assigned students", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/admin/assigned-students").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/users-all", () => {
  it("403s for admin (not part of USER_MGMT)", async () => {
    const res = await request(app).get("/api/admin/users-all").set("Cookie", adminCookie);
    expect(res.status).toBe(403);
  });

  it("normalizes a parent row's details and parses their students JSON", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          total_count: "1",
          id: 1,
          username: "jane",
          user_email: "login@x.com",
          role: "parent",
          school_name: "Ilm School",
          parent_first_name: "Jane",
          parent_middle_name: null,
          parent_last_name: "Doe",
          parent_date_of_birth: null,
          parent_address1: "1 Road",
          parent_address2: null,
          parent_address3: null,
          parent_city: "Town",
          parent_postcode: "AB1",
          parent_medical_condition: null,
          parent_email: "jane@x.com",
          staff_first_name: null,
          staff_last_name: null,
          // The driver already parses a JSON_ARRAYAGG result into a real array
          // — a plain JS array here matches actual live behavior, not a JSON
          // string.
          students: [{ id: 1, first_name: "Sam", surname: "Doe", address1: "1 Road" }]
        }
      ])
    );

    const res = await request(app).get("/api/admin/users-all").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.users[0].first_name).toBe("Jane");
    expect(res.body.users[0].email).toBe("jane@x.com");
    expect(res.body.users[0].students).toHaveLength(1);
  });

  it("strips student cards for student-role users (Option C)", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          total_count: "1",
          id: 2,
          username: "sam",
          user_email: "sam@x.com",
          role: "student",
          school_name: "Ilm School",
          students: [{ id: 1, first_name: "Sam" }]
        }
      ])
    );

    const res = await request(app).get("/api/admin/users-all").set("Cookie", sysAdminCookie);

    expect(res.status).toBe(200);
    expect(res.body.users[0].students).toEqual([]);
    expect(res.body.users[0].first_name).toBeNull();
  });

  it("applies page/pageSize as LIMIT/OFFSET, search as a username ILIKE filter, and sort as ORDER BY direction", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .get("/api/admin/users-all?page=2&pageSize=10&search=jan&sort=za")
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ users: [], total: 0 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY u\.username DESC/);
    expect(sql).toMatch(/LIMIT \$3 OFFSET \$4/);
    // school scope, then the ILIKE pattern, then LIMIT then OFFSET, in
    // that placeholder order.
    expect(params).toEqual([10, "%jan%", 10, 20]);
  });

  it("caps pageSize at 100 and falls back to page 0 for an invalid page value", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .get("/api/admin/users-all?page=-5&pageSize=9999")
      .set("Cookie", sysAdminCookie);

    expect(res.status).toBe(200);
    const [, params] = mockQuery.mock.calls[0];
    // system_admin has no school filter, so it's just [limit, offset].
    expect(params).toEqual([100, 0]);
  });
});

describe("GET /api/admin/pending-users", () => {
  it("includes the requester's school filter for non-system_admin, plus default pagination", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/admin/pending-users").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pendingUsers: [], total: 0 });
    expect(mockQuery.mock.calls[0][1]).toEqual([10, 20, 0]);
  });

  it("applies page/pageSize as LIMIT/OFFSET and search as a username ILIKE filter", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ total_count: "1", id: 7, username: "nicole.adeyemi", email: "n@x.com", requested_role: "parent", school_name: "Ilm School", first_name: "Nicole", last_name: "Adeyemi", contact_number: "0770" }])
    );

    const res = await request(app)
      .get("/api/admin/pending-users?page=1&pageSize=5&search=nic")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pendingUsers: [
        { id: 7, username: "nicole.adeyemi", email: "n@x.com", requested_role: "parent", school_name: "Ilm School", first_name: "Nicole", last_name: "Adeyemi", contact_number: "0770" }
      ],
      total: 1
    });
    expect(mockQuery.mock.calls[0][1]).toEqual([10, "%nic%", 5, 5]);
  });
});

describe("POST /api/admin/approve/:id", () => {
  it("400s when role is missing", async () => {
    const res = await request(app).post("/api/admin/approve/9").set("Cookie", adminCookie).send({});
    expect(res.status).toBe(400);
  });

  it("403s when an admin tries to grant owner", async () => {
    const res = await request(app)
      .post("/api/admin/approve/9")
      .set("Cookie", adminCookie)
      .send({ role: "owner" });
    expect(res.status).toBe(403);
  });

  it("403s when an owner tries to grant system_admin", async () => {
    const res = await request(app)
      .post("/api/admin/approve/9")
      .set("Cookie", ownerCookie)
      .send({ role: "system_admin" });
    expect(res.status).toBe(403);
  });

  it("404s when the target user is out of the requester's school scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 99 }]));
    const res = await request(app)
      .post("/api/admin/approve/9")
      .set("Cookie", adminCookie)
      .send({ role: "teacher" });
    expect(res.status).toBe(404);
  });

  it("403s when a system_admin tries to approve a parent registration", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // getUserSchoolId
      .mockResolvedValueOnce(rows([{ requested_role: "parent" }])); // getUserRequestedRole

    const res = await request(app)
      .post("/api/admin/approve/9")
      .set("Cookie", sysAdminCookie)
      .send({ role: "parent" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/System admins cannot approve/);
  });

  it("lets a system_admin approve a staff registration", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ requested_role: "staff" }]))
      .mockResolvedValueOnce(rows([{ id: 4 }])) // role lookup
      .mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/admin/approve/9")
      .set("Cookie", sysAdminCookie)
      .send({ role: "teacher" });

    expect(res.status).toBe(200);
  });

  it("400s on an invalid role name", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post("/api/admin/approve/9")
      .set("Cookie", adminCookie)
      .send({ role: "not-a-role" });

    expect(res.status).toBe(400);
  });

  it("approving a parent also flips their pending guardian link requests to approved", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // getUserSchoolId
      .mockResolvedValueOnce(rows([{ id: 4 }])) // role lookup
      .mockResolvedValueOnce(rows([])) // update users
      .mockResolvedValueOnce(rows([{ id: 55 }])) // parent lookup
      .mockResolvedValueOnce(rows([])); // update student_guardians

    const res = await request(app)
      .post("/api/admin/approve/9")
      .set("Cookie", adminCookie)
      .send({ role: "parent" });

    expect(res.status).toBe(200);
    const flipCall = mockQuery.mock.calls[4];
    expect(flipCall[0]).toMatch(/UPDATE student_guardians SET status = 'approved'/);
    expect(flipCall[1]).toEqual([55]);
  });

  it("provisions a login for a newly-approved child with no login yet, when password_management is on", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // getUserSchoolId
      .mockResolvedValueOnce(rows([{ id: 4 }])) // role lookup
      .mockResolvedValueOnce(rows([])) // update users
      .mockResolvedValueOnce(rows([{ id: 55 }])) // parent lookup
      .mockResolvedValueOnce(rows([])) // update student_guardians
      .mockResolvedValueOnce(rows([{ id: 701, first_name: "Amy", surname: "Doe" }])) // children with no login
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup
      .mockResolvedValueOnce(rows([])) // generateUniqueUsername: no collision
      .mockResolvedValueOnce(rows([{ id: 900 }])) // insert users
      .mockResolvedValueOnce(rows([])); // update students.user_id

    const res = await request(app)
      .post("/api/admin/approve/9")
      .set("Cookie", adminCookie)
      .send({ role: "parent" });

    expect(res.status).toBe(200);
    expect(res.body.studentAccounts).toHaveLength(1);
    expect(res.body.studentAccounts[0]).toMatchObject({ studentId: 701, name: "Amy Doe", username: "Amy Doe" });
    expect(typeof res.body.studentAccounts[0].temporaryPassword).toBe("string");
    expect(res.body.studentAccounts[0].temporaryPassword.length).toBeGreaterThan(0);

    const insertCall = mockQuery.mock.calls[8];
    expect(insertCall[0]).toMatch(/INSERT INTO users/);
    expect(insertCall[0]).toMatch(/must_reset_password/);
  });

  it("does not provision student logins when password_management is disabled for the school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // getUserSchoolId
      .mockResolvedValueOnce(rows([{ id: 4 }])) // role lookup
      .mockResolvedValueOnce(rows([])) // update users
      .mockResolvedValueOnce(rows([{ id: 55 }])) // parent lookup
      .mockResolvedValueOnce(rows([])); // update student_guardians

    const res = await request(app)
      .post("/api/admin/approve/9")
      .set("Cookie", adminCookie)
      .send({ role: "parent" });

    expect(res.status).toBe(200);
    expect(res.body.studentAccounts).toEqual([]);
    expect(mockQuery.mock.calls).toHaveLength(5);
  });
});

describe("POST /api/admin/reject/:id", () => {
  it("404s when out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/admin/reject/9").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("403s when a system_admin tries to reject a parent registration", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ requested_role: "parent" }]));

    const res = await request(app).post("/api/admin/reject/9").set("Cookie", sysAdminCookie);
    expect(res.status).toBe(403);
  });

  it("wipes a student that this parent is the sole guardian of, on rejection", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // getUserSchoolId (adminCookie: not platform-wide, so no getUserRequestedRole call)
      .mockResolvedValueOnce(rows([{ id: 55 }])) // parent lookup
      .mockResolvedValueOnce(rows([{ student_id: 300 }])) // sole-guardian student lookup
      .mockResolvedValueOnce(rows([])) // delete student_classes
      .mockResolvedValueOnce(rows([])) // delete students
      .mockResolvedValueOnce(rows([])) // delete student_guardians (any remaining requests)
      .mockResolvedValueOnce(rows([])) // delete parents
      .mockResolvedValueOnce(rows([])) // delete staff_details (no-op)
      .mockResolvedValueOnce(rows([])); // delete users

    const res = await request(app).post("/api/admin/reject/9").set("Cookie", adminCookie);
    expect(res.status).toBe(200);

    const studentDeleteCall = mockQuery.mock.calls[4];
    expect(studentDeleteCall[0]).toMatch(/DELETE FROM students WHERE id = ANY/);
    expect(studentDeleteCall[1]).toEqual([[300]]);
  });

  it("leaves a student alone on rejection if it already has another guardian", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // getUserSchoolId
      .mockResolvedValueOnce(rows([{ id: 55 }])) // parent lookup
      .mockResolvedValueOnce(rows([])) // sole-guardian lookup: none (student has another guardian)
      .mockResolvedValueOnce(rows([])) // delete student_guardians (drop the pending request only)
      .mockResolvedValueOnce(rows([])) // delete parents
      .mockResolvedValueOnce(rows([])) // delete staff_details (no-op)
      .mockResolvedValueOnce(rows([])); // delete users

    const res = await request(app).post("/api/admin/reject/9").set("Cookie", adminCookie);
    expect(res.status).toBe(200);

    // No "DELETE FROM students" call should have been made at all
    const calledStudentDelete = mockQuery.mock.calls.some(c => /DELETE FROM students WHERE id IN/.test(c[0]));
    expect(calledStudentDelete).toBe(false);
  });
});

describe("POST /api/admin/users/:id/reset-password", () => {
  it("403s for a role outside admin/owner/system_admin", async () => {
    const res = await request(app).post("/api/admin/users/9/reset-password").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("404s when out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/admin/users/9/reset-password").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("403s when an admin tries to reset an owner's password (escalation)", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // getUserSchoolId
      .mockResolvedValueOnce(rows([{ name: "owner" }])); // getUserRoleName
    const res = await request(app).post("/api/admin/users/9/reset-password").set("Cookie", adminCookie);
    expect(res.status).toBe(403);
  });

  it("403s when an owner tries to reset a system_admin's password (escalation)", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ name: "system_admin" }]));
    const res = await request(app).post("/api/admin/users/9/reset-password").set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("403s when the feature is disabled for the target's school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ name: "teacher" }]));
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).post("/api/admin/users/9/reset-password").set("Cookie", adminCookie);
    expect(res.status).toBe(403);
  });

  it("resets the password and returns a one-time temporary password", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ name: "teacher" }]))
      .mockResolvedValueOnce(rows([])); // UPDATE
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).post("/api/admin/users/9/reset-password").set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(typeof res.body.temporaryPassword).toBe("string");
    expect(res.body.temporaryPassword.length).toBeGreaterThan(0);
    expect(mockQuery).toHaveBeenLastCalledWith(
      "UPDATE users SET password_hash = $1, token_version = token_version + 1, must_reset_password = TRUE WHERE id = $2",
      expect.arrayContaining(["9"])
    );
  });

  it("system_admin can reset an admin's password across schools", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 77 }]))
      .mockResolvedValueOnce(rows([{ name: "admin" }]))
      .mockResolvedValueOnce(rows([]));
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).post("/api/admin/users/9/reset-password").set("Cookie", sysAdminCookie);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/students/:id/generate-login", () => {
  it("403s for a role outside admin/owner/system_admin", async () => {
    const res = await request(app).post("/api/admin/students/1/generate-login").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("404s when out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/admin/students/1/generate-login").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("400s when the student already has a login", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ school_id: 10, user_id: 900, first_name: "Amy", surname: "Doe" }])
    );
    const res = await request(app).post("/api/admin/students/1/generate-login").set("Cookie", adminCookie);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already has a login/);
  });

  it("403s when password_management is disabled for the student's school", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([{ school_id: 10, user_id: null, first_name: "Amy", surname: "Doe" }])
    );
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).post("/api/admin/students/1/generate-login").set("Cookie", adminCookie);
    expect(res.status).toBe(403);
  });

  it("creates a login and returns a username and one-time temporary password", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10, user_id: null, first_name: "Amy", surname: "Doe" }])) // student lookup
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup
      .mockResolvedValueOnce(rows([])) // generateUniqueUsername: no collision
      .mockResolvedValueOnce(rows([{ id: 900 }])) // insert users
      .mockResolvedValueOnce(rows([])); // update students.user_id
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).post("/api/admin/students/1/generate-login").set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("Amy Doe");
    expect(typeof res.body.temporaryPassword).toBe("string");
    expect(res.body.temporaryPassword.length).toBeGreaterThan(0);

    const insertCall = mockQuery.mock.calls[3];
    expect(insertCall[0]).toMatch(/INSERT INTO users/);
    expect(insertCall[0]).toMatch(/must_reset_password/);
  });

  it("disambiguates the username on a collision", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10, user_id: null, first_name: "Amy", surname: "Doe" }])) // student lookup
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup
      .mockResolvedValueOnce(rows([{ id: 1 }])) // "Amy Doe" taken
      .mockResolvedValueOnce(rows([])) // "Amy Doe 2" free
      .mockResolvedValueOnce(rows([{ id: 901 }])) // insert users
      .mockResolvedValueOnce(rows([])); // update students.user_id
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    const res = await request(app).post("/api/admin/students/1/generate-login").set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("Amy Doe 2");
  });
});

describe("DELETE /api/admin/remove-student/:id", () => {
  it("404s when out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).delete("/api/admin/remove-student/1").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("removes the student", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app).delete("/api/admin/remove-student/1").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/remove-parent/:id", () => {
  it("404s when out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).delete("/api/admin/remove-parent/1").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("400s when the parent still has linked students", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ cnt: 2 }]));

    const res = await request(app).delete("/api/admin/remove-parent/1").set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });

  it("removes the parent and their login when they have no students left", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ cnt: 0 }]))
      .mockResolvedValueOnce(rows([{ user_id: 42 }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app).delete("/api/admin/remove-parent/1").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[4][0]).toMatch(/DELETE FROM users/);
  });
});

describe("GET /api/admin/guardian-requests", () => {
  it("403s for a role outside STAFF_MGMT", async () => {
    const res = await request(app).get("/api/admin/guardian-requests").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("returns pending requests for the caller's school", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ student_id: 1, parent_id: 2 }]));
    const res = await request(app).get("/api/admin/guardian-requests").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("POST /api/admin/guardian-requests/approve", () => {
  it("400s when student_id or parent_id is missing", async () => {
    const res = await request(app)
      .post("/api/admin/guardian-requests/approve")
      .set("Cookie", adminCookie)
      .send({ student_id: 1 });
    expect(res.status).toBe(400);
  });

  it("404s when the student is out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/admin/guardian-requests/approve")
      .set("Cookie", adminCookie)
      .send({ student_id: 1, parent_id: 2 });
    expect(res.status).toBe(404);
  });

  it("404s when there's no matching pending request", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/admin/guardian-requests/approve")
      .set("Cookie", adminCookie)
      .send({ student_id: 1, parent_id: 2 });
    expect(res.status).toBe(404);
  });

  it("approves the pending request", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{}]));
    const res = await request(app)
      .post("/api/admin/guardian-requests/approve")
      .set("Cookie", adminCookie)
      .send({ student_id: 1, parent_id: 2 });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/guardian-requests/reject", () => {
  it("400s when student_id or parent_id is missing", async () => {
    const res = await request(app)
      .post("/api/admin/guardian-requests/reject")
      .set("Cookie", adminCookie)
      .send({ parent_id: 2 });
    expect(res.status).toBe(400);
  });

  it("rejects the pending request", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{}]));
    const res = await request(app)
      .post("/api/admin/guardian-requests/reject")
      .set("Cookie", adminCookie)
      .send({ student_id: 1, parent_id: 2 });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/students/:studentId/assign-guardian", () => {
  it("400s when parent_id is missing", async () => {
    const res = await request(app)
      .post("/api/admin/students/1/assign-guardian")
      .set("Cookie", adminCookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("404s when the student is out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/admin/students/1/assign-guardian")
      .set("Cookie", adminCookie)
      .send({ parent_id: 2 });
    expect(res.status).toBe(404);
  });

  it("400s when the parent belongs to a different school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }])) // student's school
      .mockResolvedValueOnce(rows([{ school_id: 99 }])); // parent's school (different)
    const res = await request(app)
      .post("/api/admin/students/1/assign-guardian")
      .set("Cookie", adminCookie)
      .send({ parent_id: 2 });
    expect(res.status).toBe(400);
  });

  it("assigns the guardian", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/admin/students/1/assign-guardian")
      .set("Cookie", adminCookie)
      .send({ parent_id: 2 });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/students/:studentId/remove-guardian", () => {
  it("400s when parent_id is missing", async () => {
    const res = await request(app)
      .post("/api/admin/students/1/remove-guardian")
      .set("Cookie", adminCookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("400s when this is the student's only guardian", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ cnt: 1 }]));
    const res = await request(app)
      .post("/api/admin/students/1/remove-guardian")
      .set("Cookie", adminCookie)
      .send({ parent_id: 2 });
    expect(res.status).toBe(400);
  });

  it("removes the guardian when another one remains", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ cnt: 2 }]))
      .mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/admin/students/1/remove-guardian")
      .set("Cookie", adminCookie)
      .send({ parent_id: 2 });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/roles", () => {
  it("allows maintainer and returns roles", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, name: "admin" }]));
    const res = await request(app).get("/api/admin/roles").set("Cookie", maintainerCookie);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/roles/add", () => {
  it("reports failure for an empty name without a 4xx status", async () => {
    const res = await request(app)
      .post("/api/admin/roles/add")
      .set("Cookie", maintainerCookie)
      .send({ name: "" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });

  it("reports failure for an invalid name format", async () => {
    const res = await request(app)
      .post("/api/admin/roles/add")
      .set("Cookie", maintainerCookie)
      .send({ name: "1bad" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });

  it("reports failure when the role already exists", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1 }]));
    const res = await request(app)
      .post("/api/admin/roles/add")
      .set("Cookie", maintainerCookie)
      .send({ name: "helper" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });

  it("creates a new role", async () => {
    mockQuery.mockResolvedValueOnce(rows([])).mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/admin/roles/add")
      .set("Cookie", maintainerCookie)
      .send({ name: "helper" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("403s for admin (roles/add is maintainer/system_admin only)", async () => {
    const res = await request(app)
      .post("/api/admin/roles/add")
      .set("Cookie", adminCookie)
      .send({ name: "helper" });
    expect(res.status).toBe(403);
  });

  it("403s for owner — roles are platform-wide, not school-scoped", async () => {
    const res = await request(app)
      .post("/api/admin/roles/add")
      .set("Cookie", ownerCookie)
      .send({ name: "helper" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/users/:id", () => {
  it("404s when the user is not found / out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).delete("/api/admin/users/9").set("Cookie", ownerCookie);
    expect(res.status).toBe(404);
  });

  it("403s when trying to delete an owner", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ role: "owner", school_id: 10 }]));
    const res = await request(app).delete("/api/admin/users/9").set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("400s when the user still has linked students as a parent", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ role: "parent", school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 55 }])) // parents lookup
      .mockResolvedValueOnce(rows([{ cnt: 1 }])); // student count

    const res = await request(app).delete("/api/admin/users/9").set("Cookie", ownerCookie);
    expect(res.status).toBe(400);
  });

  it("deletes a teacher user and its dependencies", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ role: "teacher", school_id: 10 }]))
      .mockResolvedValueOnce(rows([])) // no parent row
      .mockResolvedValueOnce(rows([])) // delete staff_details
      .mockResolvedValueOnce(rows([])) // delete teacher_classes
      .mockResolvedValueOnce(rows([])) // update students
      .mockResolvedValueOnce(rows([])); // delete users

    const res = await request(app).delete("/api/admin/users/9").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/admin/users/:id/update-details", () => {
  it("404s when the user is out of scope", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .put("/api/admin/users/9/update-details")
      .set("Cookie", ownerCookie)
      .send({ first_name: "A" });
    expect(res.status).toBe(404);
  });

  it("updates an existing parent profile", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ role: "parent", school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 1 }])) // existing parent row
      .mockResolvedValueOnce(rows([])); // update

    const res = await request(app)
      .put("/api/admin/users/9/update-details")
      .set("Cookie", ownerCookie)
      .send({ first_name: "Jane", last_name: "Doe" });

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[2][0]).toMatch(/UPDATE parents/);
  });

  it("inserts a staff_details row when a staff-role user has none yet", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ role: "teacher", school_id: 10 }]))
      .mockResolvedValueOnce(rows([])) // no existing staff_details
      .mockResolvedValueOnce(rows([])); // insert

    const res = await request(app)
      .put("/api/admin/users/9/update-details")
      .set("Cookie", ownerCookie)
      .send({ first_name: "Alex" });

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[2][0]).toMatch(/INSERT INTO staff_details/);
  });

  it("400s for a role that doesn't support detail editing", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ role: "pending", school_id: 10 }]));
    const res = await request(app)
      .put("/api/admin/users/9/update-details")
      .set("Cookie", ownerCookie)
      .send({ first_name: "Alex" });
    expect(res.status).toBe(400);
  });

  it("409s on a duplicate email", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ role: "parent", school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ id: 1 }]));
    mockQuery.mockRejectedValueOnce({ code: "23505" });

    const res = await request(app)
      .put("/api/admin/users/9/update-details")
      .set("Cookie", ownerCookie)
      .send({ first_name: "Jane", email: "dup@x.com" });

    expect(res.status).toBe(409);
  });
});

describe("GET /api/admin/attendance/report", () => {
  it("403s when the feature is disabled", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).get("/api/admin/attendance/report").set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("400s on an invalid date format", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .get("/api/admin/attendance/report?startDate=not-a-date")
      .set("Cookie", ownerCookie);
    expect(res.status).toBe(400);
  });

  it("400s when startDate is after endDate", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .get("/api/admin/attendance/report?startDate=2026-06-01&endDate=2026-01-01")
      .set("Cookie", ownerCookie);
    expect(res.status).toBe(400);
  });

  it("400s when endDate is in the future", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .get("/api/admin/attendance/report?endDate=2099-01-01")
      .set("Cookie", ownerCookie);
    expect(res.status).toBe(400);
  });

  it("404s when the requested class is out of scope", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 99 }]));

    const res = await request(app)
      .get("/api/admin/attendance/report?classId=5")
      .set("Cookie", ownerCookie);

    expect(res.status).toBe(404);
  });

  it("streams a CSV attachment for a valid request", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(
      rows([
        { date: "2026-01-01", first_name: "Sam", surname: "Doe", class_name: "7A", status: "PRESENT" }
      ])
    );

    const res = await request(app).get("/api/admin/attendance/report").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    expect(res.body).toContain("Sam,Doe,7A,Present");
  });
});

describe("GET /api/admin/analytics", () => {
  it("403s for a role outside admin/owner", async () => {
    const res = await request(app).get("/api/admin/analytics").set("Cookie", parentCookie);
    expect(res.status).toBe(403);
  });

  it("403s when the feature is disabled", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).get("/api/admin/analytics").set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("400s on an invalid range value", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/admin/analytics?range=foo").set("Cookie", ownerCookie);
    expect(res.status).toBe(400);
  });

  it("falls back to the last 30 days when no current term exists", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([])) // resolveCurrentTerm: no matching term
      .mockResolvedValueOnce(rows([])) // attendance rows
      .mockResolvedValueOnce(rows([])); // class rows

    const res = await request(app).get("/api/admin/analytics").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.attendanceTrend.range).toBe("term");
    expect(res.body.attendanceTrend.termName).toBeNull();
    expect(res.body.attendanceTrend.rangeEnd).toBe(todayStr());
  });

  it("uses the current term's date range when one covers today", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ name: "Term 1", start_date: "2026-01-01", end_date: "2099-01-01" }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app).get("/api/admin/analytics").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.attendanceTrend.termName).toBe("Term 1");
    expect(res.body.attendanceTrend.rangeStart).toBe("2026-01-01");
    // end_date is in the future, so rangeEnd is clamped to today, not the term's end_date
    expect(res.body.attendanceTrend.rangeEnd).toBe(todayStr());
  });

  it("uses a trailing 365-day window for range=year regardless of any current term", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([])) // attendance rows
      .mockResolvedValueOnce(rows([])); // class rows

    const res = await request(app).get("/api/admin/analytics?range=year").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.attendanceTrend.range).toBe("year");
    expect(res.body.attendanceTrend.termName).toBeNull();
    expect(res.body.attendanceTrend.rangeStart).toBe(daysAgoStr(365));
    // range=year never resolves a term, so only 2 queries run (no school_terms lookup)
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("computes attendance rate per day and excludes days with no records from division", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([])) // no current term
      .mockResolvedValueOnce(
        rows([
          { date: "2026-01-01", present_count: 18, total_count: 20 },
          { date: "2026-01-02", present_count: 0, total_count: 0 }
        ])
      )
      .mockResolvedValueOnce(rows([]));

    const res = await request(app).get("/api/admin/analytics").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.attendanceTrend.points).toEqual([
      { date: "2026-01-01", rate: 0.9 },
      { date: "2026-01-02", rate: null }
    ]);
  });

  it("includes a class with zero enrolled students as a zero bar", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(
        rows([
          { class_id: 1, class_name: "Year 7A", student_count: 28 },
          { class_id: 2, class_name: null, student_count: 0 }
        ])
      );

    const res = await request(app).get("/api/admin/analytics").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.studentsPerClass).toEqual([
      { classId: 1, className: "Year 7A", studentCount: 28 },
      { classId: 2, className: "(Unnamed class)", studentCount: 0 }
    ]);
  });

  it("returns 200 with empty arrays for a school with no classes or attendance", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app).get("/api/admin/analytics").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      attendanceTrend: {
        range: "term",
        rangeStart: daysAgoStr(30),
        rangeEnd: todayStr(),
        termName: null,
        points: []
      },
      studentsPerClass: [],
      feesTrend: null
    });
  });

  it("400s on an invalid feesRange value", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app).get("/api/admin/analytics?feesRange=foo").set("Cookie", ownerCookie);
    expect(res.status).toBe(400);
  });

  it("omits feesTrend (null) when the fees flag is disabled", async () => {
    mockIsFeatureEnabled
      .mockResolvedValueOnce(true) // analytics_dashboard
      .mockResolvedValueOnce(false); // fees
    mockQuery
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]));

    const res = await request(app).get("/api/admin/analytics").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.feesTrend).toBeNull();
  });

  it("returns fees collected/outstanding per period for feesRange=month", async () => {
    mockIsFeatureEnabled
      .mockResolvedValueOnce(true) // analytics_dashboard
      .mockResolvedValueOnce(true); // fees
    mockQuery
      .mockResolvedValueOnce(rows([])) // no current term
      .mockResolvedValueOnce(rows([])) // attendance rows
      .mockResolvedValueOnce(rows([])) // class rows
      .mockResolvedValueOnce(
        rows([{ label: "September 2026", collected: "150.00", outstanding: "300.00" }])
      );

    const res = await request(app).get("/api/admin/analytics").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.feesTrend).toEqual({
      range: "month",
      points: [{ label: "September 2026", collected: 150, outstanding: 300 }]
    });
  });

  it("aggregates fees by calendar year for feesRange=year", async () => {
    mockIsFeatureEnabled
      .mockResolvedValueOnce(true) // analytics_dashboard
      .mockResolvedValueOnce(true); // fees
    mockQuery
      .mockResolvedValueOnce(rows([])) // no current term
      .mockResolvedValueOnce(rows([])) // attendance rows
      .mockResolvedValueOnce(rows([])) // class rows
      .mockResolvedValueOnce(rows([{ label: "2026", collected: "450.00", outstanding: "150.00" }]));

    const res = await request(app).get("/api/admin/analytics?feesRange=year").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body.feesTrend).toEqual({
      range: "year",
      points: [{ label: "2026", collected: 450, outstanding: 150 }]
    });
  });
});

describe("POST /api/admin/students/bulk-upload", () => {
  const goodRow = (overrides: Record<string, any> = {}) => ({
    student_first_name: "Sam",
    student_surname: "Doe",
    student_gender: "Male",
    student_date_of_birth: "2015-01-01",
    class_code: "7A",
    parent_first_name: "Jane",
    parent_surname: "Doe",
    parent_relationship_to_student: "Mother",
    parent_contact_number: "5551234",
    parent_email: "jane.doe@example.com",
    ...overrides
  });

  it("403s for a role outside admin (e.g. owner)", async () => {
    const res = await request(app)
      .post("/api/admin/students/bulk-upload")
      .set("Cookie", ownerCookie)
      .send({ rows: [goodRow()] });
    expect(res.status).toBe(403);
  });

  it("400s when rows is missing or empty", async () => {
    const res = await request(app).post("/api/admin/students/bulk-upload").set("Cookie", adminCookie).send({ rows: [] });
    expect(res.status).toBe(400);
  });

  it("400s when the row count exceeds the cap", async () => {
    const res = await request(app)
      .post("/api/admin/students/bulk-upload")
      .set("Cookie", adminCookie)
      .send({ rows: Array.from({ length: 501 }, () => goodRow()) });
    expect(res.status).toBe(400);
  });

  it("reports a missing-field row as an error without touching the database", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 9 }])) // parent role lookup
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup
      .mockResolvedValueOnce(rows([{ id: 77, class_code: "7A" }])) // batch class lookup
      .mockResolvedValueOnce(rows([])); // batch parent-email lookup

    const res = await request(app)
      .post("/api/admin/students/bulk-upload")
      .set("Cookie", adminCookie)
      .send({ rows: [goodRow({ student_first_name: "" })] });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ row: 1, status: "error" });
    expect(res.body.results[0].message).toMatch(/student_first_name/);
    expect(mockQuery).not.toHaveBeenCalledWith("BEGIN");
  });

  it("errors a row with an invalid class code", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 9 }])) // parent role lookup
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup
      .mockResolvedValueOnce(rows([])) // batch class lookup: not found
      .mockResolvedValueOnce(rows([])); // batch parent-email lookup

    const res = await request(app)
      .post("/api/admin/students/bulk-upload")
      .set("Cookie", adminCookie)
      .send({ rows: [goodRow({ class_code: "BADCODE" })] });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ row: 1, status: "error" });
    expect(res.body.results[0].message).toMatch(/Invalid class code/);
  });

  it("errors a row whose email belongs to a non-parent account", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 9 }])) // parent role lookup
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup
      .mockResolvedValueOnce(rows([{ id: 77, class_code: "7A" }])) // batch class lookup
      .mockResolvedValueOnce(rows([{ id: 55, email: "jane.doe@example.com", role_name: "teacher" }])); // batch parent-email lookup, wrong role

    const res = await request(app)
      .post("/api/admin/students/bulk-upload")
      .set("Cookie", adminCookie)
      .send({ rows: [goodRow()] });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ row: 1, status: "error" });
    expect(res.body.results[0].message).toMatch(/non-parent account/);
  });

  it("errors a row whose email belongs to a parent account in a different school", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 9 }])) // parent role lookup
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup
      .mockResolvedValueOnce(rows([{ id: 77, class_code: "7A" }])) // batch class lookup
      // Same email, valid "parent" role, but a different school_id than the
      // requesting admin's (10) — must not be treated as reusable, or this
      // row would silently attach a different school's parent as an
      // approved guardian of this school's student.
      .mockResolvedValueOnce(rows([{ id: 55, email: "jane.doe@example.com", role_name: "parent", school_id: 99 }])); // batch parent-email lookup, different school

    const res = await request(app)
      .post("/api/admin/students/bulk-upload")
      .set("Cookie", adminCookie)
      .send({ rows: [goodRow()] });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ row: 1, status: "error" });
    expect(res.body.results[0].message).toMatch(/different school/);
  });

  it("links an existing parent (by email) as an additional guardian without creating a new account", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 9 }])) // parent role lookup
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup
      .mockResolvedValueOnce(rows([{ id: 77, class_code: "7A" }])) // batch class lookup
      .mockResolvedValueOnce(rows([{ id: 55, email: "jane.doe@example.com", role_name: "parent", school_id: 10 }])) // batch parent-email lookup, same school
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockResolvedValueOnce(rows([{ id: 200 }])) // parents lookup by user_id
      .mockResolvedValueOnce(rows([])) // guardian_code uniqueness check
      .mockResolvedValueOnce(rows([{ id: 300 }])) // insert student
      .mockResolvedValueOnce(rows([])) // insert student_guardians
      .mockResolvedValueOnce(rows([])) // insert student_classes
      .mockResolvedValueOnce(rows([])); // COMMIT

    const res = await request(app)
      .post("/api/admin/students/bulk-upload")
      .set("Cookie", adminCookie)
      .send({ rows: [goodRow()] });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ row: 1, status: "created", studentId: 300, parentCreated: false });
    expect(res.body.results[0].temporaryPassword).toBeUndefined();
    expect(mockQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("creates a new parent account and returns a temporary password when the email is unknown", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 9 }])) // parent role lookup
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup
      .mockResolvedValueOnce(rows([{ id: 77, class_code: "7A" }])) // batch class lookup
      .mockResolvedValueOnce(rows([])) // batch parent-email lookup: no existing user with this email
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockResolvedValueOnce(rows([{ id: 400 }])) // insert users
      .mockResolvedValueOnce(rows([{ id: 401 }])) // insert parents
      .mockResolvedValueOnce(rows([])) // guardian_code uniqueness check
      .mockResolvedValueOnce(rows([{ id: 500 }])) // insert student
      .mockResolvedValueOnce(rows([])) // insert student_guardians
      .mockResolvedValueOnce(rows([])) // insert student_classes
      .mockResolvedValueOnce(rows([])); // COMMIT

    const res = await request(app)
      .post("/api/admin/students/bulk-upload")
      .set("Cookie", adminCookie)
      .send({ rows: [goodRow()] });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ row: 1, status: "created", studentId: 500, parentCreated: true });
    expect(typeof res.body.results[0].temporaryPassword).toBe("string");
    expect(res.body.results[0].temporaryPassword.length).toBeGreaterThan(0);
  });

  it("processes a bad row without affecting the others in the same batch", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 9 }])) // parent role lookup (once per request)
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup (once per request)
      // Batched up front for the whole request — only row 1's class code
      // ("7A") and email resolve to anything; row 2's "BADCODE" isn't in
      // the result set at all, so it never reaches the database.
      .mockResolvedValueOnce(rows([{ id: 77, class_code: "7A" }])) // batch class lookup
      .mockResolvedValueOnce(rows([{ id: 55, email: "jane.doe@example.com", role_name: "parent", school_id: 10 }])) // batch parent-email lookup, same school
      // Row 1 (good, existing parent):
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockResolvedValueOnce(rows([{ id: 200 }])) // parents lookup by user_id
      .mockResolvedValueOnce(rows([])) // guardian_code uniqueness check
      .mockResolvedValueOnce(rows([{ id: 300 }])) // insert student
      .mockResolvedValueOnce(rows([])) // insert student_guardians
      .mockResolvedValueOnce(rows([])) // insert student_classes
      .mockResolvedValueOnce(rows([])); // COMMIT
      // Row 2 (bad class code) makes no further database calls at all —
      // it fails the class-code map lookup before any query would run.

    const res = await request(app)
      .post("/api/admin/students/bulk-upload")
      .set("Cookie", adminCookie)
      .send({ rows: [goodRow(), goodRow({ class_code: "BADCODE", parent_email: "other@example.com" })] });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(res.body.results[0]).toMatchObject({ row: 1, status: "created" });
    expect(res.body.results[1]).toMatchObject({ row: 2, status: "error" });
  });

  it("also provisions a student login when password_management is enabled", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);

    mockQuery
      .mockResolvedValueOnce(rows([{ id: 9 }])) // parent role lookup
      .mockResolvedValueOnce(rows([{ id: 7 }])) // student role lookup
      .mockResolvedValueOnce(rows([{ id: 77, class_code: "7A" }])) // batch class lookup
      .mockResolvedValueOnce(rows([{ id: 55, email: "jane.doe@example.com", role_name: "parent", school_id: 10 }])) // batch parent-email lookup, same school
      .mockResolvedValueOnce(rows([])) // BEGIN
      .mockResolvedValueOnce(rows([{ id: 200 }])) // parents lookup by user_id
      .mockResolvedValueOnce(rows([])) // guardian_code uniqueness check
      .mockResolvedValueOnce(rows([{ id: 300 }])) // insert student
      .mockResolvedValueOnce(rows([])) // insert student_guardians
      .mockResolvedValueOnce(rows([])) // insert student_classes
      .mockResolvedValueOnce(rows([])) // generateUniqueUsername: no collision
      .mockResolvedValueOnce(rows([{ id: 900 }])) // insert users (student)
      .mockResolvedValueOnce(rows([])) // update students.user_id
      .mockResolvedValueOnce(rows([])); // COMMIT

    const res = await request(app)
      .post("/api/admin/students/bulk-upload")
      .set("Cookie", adminCookie)
      .send({ rows: [goodRow()] });

    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ row: 1, status: "created", studentUsername: "Sam Doe" });
    expect(typeof res.body.results[0].studentTemporaryPassword).toBe("string");
    expect(res.body.results[0].studentTemporaryPassword.length).toBeGreaterThan(0);
  });
});
