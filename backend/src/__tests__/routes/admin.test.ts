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

const adminCookie = authCookie({ userId: 1, role: "admin", schoolId: 10 });
const ownerCookie = authCookie({ userId: 2, role: "owner", schoolId: 10 });
const sysAdminCookie = authCookie({ userId: 3, role: "system_admin", schoolId: null });
const parentCookie = authCookie({ userId: 4, role: "parent", schoolId: 10 });
const maintainerCookie = authCookie({ userId: 5, role: "maintainer", schoolId: 10 });

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
    expect(mockQuery.mock.calls[0][0]).toMatch(/WHERE c.school_id = \?/);
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
      .mockResolvedValueOnce(rows({ affectedRows: 1 })); // insert

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
    mockQuery.mockRejectedValueOnce({ code: "ER_DUP_ENTRY" });

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
      .mockResolvedValueOnce(rows({ affectedRows: 1 })); // update

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
      .mockResolvedValueOnce(rows({}))
      .mockResolvedValueOnce(rows({}))
      .mockResolvedValueOnce(rows({}));

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
      .mockResolvedValueOnce(rows({}));

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
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10 }])).mockResolvedValueOnce(rows({}));

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
      .mockResolvedValueOnce(rows({}));

    const res = await request(app)
      .post("/api/admin/classes/5/assign-student")
      .set("Cookie", adminCookie)
      .send({ studentId: 8 });

    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/classes/:id/remove-student", () => {
  it("removes the student from the class", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ school_id: 10 }])).mockResolvedValueOnce(rows({}));

    const res = await request(app)
      .post("/api/admin/classes/5/remove-student")
      .set("Cookie", adminCookie)
      .send({ studentId: 8 });

    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/teachers", () => {
  it("groups classes under each teacher", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        { teacher_id: 1, username: "t1", email: "t1@x.com", class_id: 5, class_name: "7A", year_group: "7" },
        { teacher_id: 1, username: "t1", email: "t1@x.com", class_id: 6, class_name: "7B", year_group: "7" },
        { teacher_id: 2, username: "t2", email: "t2@x.com", class_id: null, class_name: null, year_group: null }
      ])
    );

    const res = await request(app).get("/api/admin/teachers").set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].assigned_classes).toHaveLength(2);
    expect(res.body[1].assigned_classes).toHaveLength(0);
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
      .mockResolvedValueOnce(rows({})) // delete staff_details
      .mockResolvedValueOnce(rows({})) // delete teacher_classes
      .mockResolvedValueOnce(rows({})) // update students set user_id null
      .mockResolvedValueOnce(rows({})); // delete users

    const res = await request(app).delete("/api/admin/teachers/7").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/students-parents", () => {
  it("returns the joined overview", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ student_id: 1 }]));
    const res = await request(app).get("/api/admin/students-parents").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ student_id: 1 }]);
  });
});

describe("GET /api/admin/parents", () => {
  it("returns parents including those with zero students", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ parent_id: 1, student_count: 0 }]));
    const res = await request(app).get("/api/admin/parents").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
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
          students: JSON.stringify([{ id: 1, first_name: "Sam", surname: "Doe", address1: "1 Road" }])
        }
      ])
    );

    const res = await request(app).get("/api/admin/users-all").set("Cookie", ownerCookie);

    expect(res.status).toBe(200);
    expect(res.body[0].first_name).toBe("Jane");
    expect(res.body[0].email).toBe("jane@x.com");
    expect(res.body[0].students).toHaveLength(1);
  });

  it("strips student cards for student-role users (Option C)", async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          id: 2,
          username: "sam",
          user_email: "sam@x.com",
          role: "student",
          school_name: "Ilm School",
          students: JSON.stringify([{ id: 1, first_name: "Sam" }])
        }
      ])
    );

    const res = await request(app).get("/api/admin/users-all").set("Cookie", sysAdminCookie);

    expect(res.status).toBe(200);
    expect(res.body[0].students).toEqual([]);
    expect(res.body[0].first_name).toBeNull();
  });
});

describe("GET /api/admin/pending-users", () => {
  it("includes the requester's school filter for non-system_admin", async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/admin/pending-users").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual([10]);
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
      .mockResolvedValueOnce(rows({}));

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

  it("wipes the parent and their submitted children on rejection", async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ school_id: 10 }]))
      .mockResolvedValueOnce(rows([{ requested_role: "parent" }]))
      .mockResolvedValueOnce(rows([{ id: 55 }])) // parent lookup
      .mockResolvedValueOnce(rows({})) // delete students
      .mockResolvedValueOnce(rows({})) // delete parents
      .mockResolvedValueOnce(rows({})) // delete staff_details (no-op)
      .mockResolvedValueOnce(rows({})); // delete users

    const res = await request(app).post("/api/admin/reject/9").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
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
      .mockResolvedValueOnce(rows({}))
      .mockResolvedValueOnce(rows({}));

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
      .mockResolvedValueOnce(rows({}))
      .mockResolvedValueOnce(rows({}));

    const res = await request(app).delete("/api/admin/remove-parent/1").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[4][0]).toMatch(/DELETE FROM users/);
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
      .set("Cookie", ownerCookie)
      .send({ name: "" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });

  it("reports failure for an invalid name format", async () => {
    const res = await request(app)
      .post("/api/admin/roles/add")
      .set("Cookie", ownerCookie)
      .send({ name: "1bad" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });

  it("reports failure when the role already exists", async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 1 }]));
    const res = await request(app)
      .post("/api/admin/roles/add")
      .set("Cookie", ownerCookie)
      .send({ name: "helper" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });

  it("creates a new role", async () => {
    mockQuery.mockResolvedValueOnce(rows([])).mockResolvedValueOnce(rows({}));
    const res = await request(app)
      .post("/api/admin/roles/add")
      .set("Cookie", ownerCookie)
      .send({ name: "helper" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("403s for admin (roles/add is owner/maintainer/system_admin only)", async () => {
    const res = await request(app)
      .post("/api/admin/roles/add")
      .set("Cookie", adminCookie)
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
      .mockResolvedValueOnce(rows({})) // delete staff_details
      .mockResolvedValueOnce(rows({})) // delete teacher_classes
      .mockResolvedValueOnce(rows({})) // update students
      .mockResolvedValueOnce(rows({})); // delete users

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
      .mockResolvedValueOnce(rows({})); // update

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
      .mockResolvedValueOnce(rows({})); // insert

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
    mockQuery.mockRejectedValueOnce({ code: "ER_DUP_ENTRY" });

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
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.text).toContain("Sam,Doe,7A,Present");
  });
});
