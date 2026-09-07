jest.mock("../../config/db");
jest.mock("../../utils/featureFlags", () => ({
  isFeatureEnabled: jest.fn()
}));

import crypto from "crypto";
import app from "../../app";
import { rows } from "../helpers/db";
import { authCookie } from "../helpers/auth";
import { request } from "../helpers/request";
import { isFeatureEnabled } from "../../utils/featureFlags";
import { testEnv } from "../helpers/testEnv";

const signWebhook = (payload: object) =>
  crypto
    .createHmac("sha256", testEnv.DIRECT_DEBIT_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");

const { mockDb } = jest.requireMock<typeof import("../../config/__mocks__/db")>("../../config/db");
const mockQuery = mockDb.query as jest.Mock;
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock;

let adminCookie: string;
let treasurerCookie: string;
let teacherCookie: string;
let parentCookie: string;
let ownerCookie: string;

beforeAll(async () => {
  adminCookie = await authCookie({ userId: 1, role: "admin", schoolId: 10 });
  treasurerCookie = await authCookie({ userId: 2, role: "treasurer", schoolId: 10 });
  teacherCookie = await authCookie({ userId: 3, role: "teacher", schoolId: 10 });
  parentCookie = await authCookie({ userId: 4, role: "parent", schoolId: 10 });
  ownerCookie = await authCookie({ userId: 5, role: "owner", schoolId: 10 });
});

describe("GET /api/fees/fee-periods", () => {
  it("403s for owner (deliberately excluded, unlike every other admin capability)", async () => {
    const res = await request(app).get("/api/fees/fee-periods").set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("403s for teacher/parent", async () => {
    const res1 = await request(app).get("/api/fees/fee-periods").set("Cookie", teacherCookie);
    expect(res1.status).toBe(403);
    const res2 = await request(app).get("/api/fees/fee-periods").set("Cookie", parentCookie);
    expect(res2.status).toBe(403);
  });

  it("403s when the fees flag is disabled for the school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const res = await request(app).get("/api/fees/fee-periods").set("Cookie", adminCookie);
    expect(res.status).toBe(403);
  });

  it("returns fee periods for treasurer", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, name: "September 2026", start_date: "2026-09-01", end_date: "2026-09-30" }]));
    const res = await request(app).get("/api/fees/fee-periods").set("Cookie", treasurerCookie);
    expect(res.status).toBe(200);
    expect(res.body.feePeriods).toHaveLength(1);
  });
});

describe("POST /api/fees/fee-periods", () => {
  it("400s when name is missing", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/fees/fee-periods")
      .set("Cookie", adminCookie)
      .send({ start_date: "2026-09-01", end_date: "2026-09-30" });
    expect(res.status).toBe(400);
  });

  it("400s when end_date is before start_date", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/fees/fee-periods")
      .set("Cookie", adminCookie)
      .send({ name: "September 2026", start_date: "2026-09-30", end_date: "2026-09-01" });
    expect(res.status).toBe(400);
  });

  it("409s on a duplicate period name for the school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockRejectedValueOnce({ code: "23505" });
    const res = await request(app)
      .post("/api/fees/fee-periods")
      .set("Cookie", adminCookie)
      .send({ name: "September 2026", start_date: "2026-09-01", end_date: "2026-09-30" });
    expect(res.status).toBe(409);
  });

  it("creates a fee period", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 7 }]));
    const res = await request(app)
      .post("/api/fees/fee-periods")
      .set("Cookie", treasurerCookie)
      .send({ name: "September 2026", start_date: "2026-09-01", end_date: "2026-09-30" });
    expect(res.status).toBe(201);
    expect(res.body.feePeriod.id).toBe(7);
  });
});

describe("GET /api/fees/fee-periods/:id/fees", () => {
  it("404s when the period does not exist for this school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).get("/api/fees/fee-periods/1/fees").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("returns every student, including those with no fee row yet for this period", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, name: "September 2026" }]))
      .mockResolvedValueOnce(
        rows([
          { student_id: 1, student_first_name: "Zara", student_surname: "Ahmed", class_name: "9A", fee_id: 50, amount: "100.00", status: "unpaid", paid_at: null },
          { student_id: 2, student_first_name: "Noah", student_surname: "Okafor", class_name: "9A", fee_id: null, amount: null, status: null, paid_at: null }
        ])
      );
    const res = await request(app).get("/api/fees/fee-periods/1/fees").set("Cookie", treasurerCookie);
    expect(res.status).toBe(200);
    expect(res.body.fees).toHaveLength(2);
    expect(res.body.fees[1].fee_id).toBeNull();
  });
});

describe("GET /api/fees/classes", () => {
  it("returns the caller's school classes", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, class_name: "Year 7A" }, { id: 2, class_name: "Year 8A" }]));
    const res = await request(app).get("/api/fees/classes").set("Cookie", treasurerCookie);
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(2);
  });
});

describe("POST /api/fees/fee-periods/:id/generate", () => {
  it("404s when the period does not exist for this school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/fees/fee-periods/1/generate")
      .set("Cookie", adminCookie)
      .send({ amounts: [{ class_id: 1, amount: 100 }] });
    expect(res.status).toBe(404);
  });

  it("400s when amounts is missing or empty", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, name: "September 2026" }]));
    const res = await request(app).post("/api/fees/fee-periods/1/generate").set("Cookie", adminCookie).send({ amounts: [] });
    expect(res.status).toBe(400);
  });

  it("400s when an entry has an invalid amount", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, name: "September 2026" }]));
    const res = await request(app)
      .post("/api/fees/fee-periods/1/generate")
      .set("Cookie", adminCookie)
      .send({ amounts: [{ class_id: 1, amount: -5 }] });
    expect(res.status).toBe(400);
  });

  it("400s when an entry is missing class_id", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 1, school_id: 10, name: "September 2026" }]));
    const res = await request(app)
      .post("/api/fees/fee-periods/1/generate")
      .set("Cookie", adminCookie)
      .send({ amounts: [{ amount: 50 }] });
    expect(res.status).toBe(400);
  });

  it("400s when none of the given classes belong to this school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, name: "September 2026" }])) // loadFeePeriod
      .mockResolvedValueOnce(rows([])); // no matching classes
    const res = await request(app)
      .post("/api/fees/fee-periods/1/generate")
      .set("Cookie", adminCookie)
      .send({ amounts: [{ class_id: 999, amount: 50 }] });
    expect(res.status).toBe(400);
  });

  it("generates one fee row per student, summing amounts across every class they belong to", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true); // "fees" flag
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, name: "September 2026" }])) // loadFeePeriod
      .mockResolvedValueOnce(rows([{ id: 1 }, { id: 2 }])) // valid classes for this school
      .mockResolvedValueOnce(
        rows([
          { student_id: 5, class_id: 1 }, // in Year 7A only -> 40
          { student_id: 6, class_id: 1 }, // in Year 7A ...
          { student_id: 6, class_id: 2 } // ... and Year 8A -> 40 + 60 = 100
        ])
      ) // membershipRows
      .mockResolvedValueOnce(rows([])) // no pre-existing rows
      .mockResolvedValueOnce({ rows: [], rowCount: 2 }); // insert
    // "direct_debit" flag falls back to the mock's default (undefined ->
    // falsy), so the auto-submit branch is skipped without further mocks.

    const res = await request(app)
      .post("/api/fees/fee-periods/1/generate")
      .set("Cookie", treasurerCookie)
      .send({
        amounts: [
          { class_id: 1, amount: 40 },
          { class_id: 2, amount: 60 }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.affectedRows).toBe(2);
    expect(res.body.submittedForCollection).toBe(0);
    expect(mockQuery).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("ON CONFLICT (student_id, fee_period_id) DO NOTHING"),
      [5, 1, 40, 6, 1, 100]
    );
  });

  it("skips a student who isn't in any of the given classes", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, name: "September 2026" }]))
      .mockResolvedValueOnce(rows([{ id: 1 }]))
      .mockResolvedValueOnce(rows([])); // no student in this class
    const res = await request(app)
      .post("/api/fees/fee-periods/1/generate")
      .set("Cookie", adminCookie)
      .send({ amounts: [{ class_id: 1, amount: 40 }] });
    expect(res.status).toBe(200);
    expect(res.body.affectedRows).toBe(0);
    expect(res.body.message).toMatch(/No students found/);
  });

  it("leaves an already-existing student's row untouched (idempotent)", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, name: "September 2026" }]))
      .mockResolvedValueOnce(rows([{ id: 1 }]))
      .mockResolvedValueOnce(rows([{ student_id: 5, class_id: 1 }]))
      .mockResolvedValueOnce(rows([{ student_id: 5 }])) // already has a row
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .post("/api/fees/fee-periods/1/generate")
      .set("Cookie", adminCookie)
      .send({ amounts: [{ class_id: 1, amount: 40 }] });
    expect(res.status).toBe(200);
    expect(res.body.affectedRows).toBe(0);
  });

  it("submits newly generated fees for direct-debit collection when the student's parent has an active mandate", async () => {
    mockIsFeatureEnabled
      .mockResolvedValueOnce(true) // "fees" flag
      .mockResolvedValueOnce(true); // "direct_debit" flag
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, name: "September 2026" }])) // loadFeePeriod
      .mockResolvedValueOnce(rows([{ id: 1 }])) // valid classes
      .mockResolvedValueOnce(rows([{ student_id: 1, class_id: 1 }])) // membershipRows
      .mockResolvedValueOnce(rows([])) // no pre-existing rows — student 1 is brand new
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // insert
      .mockResolvedValueOnce(rows([{ id: 99, student_id: 1, amount: "100.00" }])) // newRows (unpaid, this period)
      .mockResolvedValueOnce(rows([{ provider_mandate_id: "stub_mandate_abc" }])) // findActiveMandateForStudent
      .mockResolvedValueOnce(rows([])); // UPDATE ... pending_collection

    const res = await request(app)
      .post("/api/fees/fee-periods/1/generate")
      .set("Cookie", adminCookie)
      .send({ amounts: [{ class_id: 1, amount: 100 }] });

    expect(res.status).toBe(200);
    expect(res.body.submittedForCollection).toBe(1);
    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("status = 'pending_collection'"),
      [expect.stringMatching(/^stub_pay_99_/), 99]
    );
  });

  it("leaves a newly generated fee as manual/unpaid when the student's parent has no active mandate", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 1, school_id: 10, name: "September 2026" }]))
      .mockResolvedValueOnce(rows([{ id: 1 }]))
      .mockResolvedValueOnce(rows([{ student_id: 1, class_id: 1 }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce(rows([{ id: 99, student_id: 1, amount: "100.00" }]))
      .mockResolvedValueOnce(rows([])); // no active mandate found

    const res = await request(app)
      .post("/api/fees/fee-periods/1/generate")
      .set("Cookie", adminCookie)
      .send({ amounts: [{ class_id: 1, amount: 100 }] });

    expect(res.status).toBe(200);
    expect(res.body.submittedForCollection).toBe(0);
  });
});

describe("PUT /api/fees/fees/:feeId", () => {
  it("404s when the fee record does not exist for this school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).put("/api/fees/fees/50").set("Cookie", adminCookie).send({ amount: 120 });
    expect(res.status).toBe(404);
  });

  it("400s when the fee is already paid", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 50, student_id: 1, fee_period_id: 1, amount: "100.00", status: "paid" }]));
    const res = await request(app).put("/api/fees/fees/50").set("Cookie", adminCookie).send({ amount: 120 });
    expect(res.status).toBe(400);
  });

  it("updates the amount on an unpaid fee", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 50, student_id: 1, fee_period_id: 1, amount: "100.00", status: "unpaid" }]))
      .mockResolvedValueOnce(rows([]));
    const res = await request(app).put("/api/fees/fees/50").set("Cookie", treasurerCookie).send({ amount: 120 });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/fees/fees/:feeId/mark-paid", () => {
  it("404s when the fee record does not exist for this school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/fees/fees/50/mark-paid").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("marks a fee as paid, recording who marked it", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 50, student_id: 1, fee_period_id: 1, amount: "100.00", status: "unpaid" }]))
      .mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/fees/fees/50/mark-paid").set("Cookie", treasurerCookie);
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining("status = 'paid'"), [2, 50]);
  });
});

describe("POST /api/fees/fees/:feeId/mark-unpaid", () => {
  it("404s when the fee record does not exist for this school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/fees/fees/50/mark-unpaid").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("clears paid status back to unpaid", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 50, student_id: 1, fee_period_id: 1, amount: "100.00", status: "paid" }]))
      .mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/fees/fees/50/mark-unpaid").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining("status = 'unpaid'"), [50]);
  });

  it("also resets payment_method/provider fields back to manual", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(
        rows([{ id: 50, student_id: 1, fee_period_id: 1, amount: "100.00", status: "failed", payment_method: "direct_debit", provider_payment_id: "stub_pay_50_x", failure_reason: "Insufficient funds" }])
      )
      .mockResolvedValueOnce(rows([]));
    const res = await request(app).post("/api/fees/fees/50/mark-unpaid").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining("payment_method = 'manual'"), [50]);
  });
});

describe("PUT /api/fees/fees/:feeId — pending_collection guard", () => {
  it("400s when the fee has already been submitted for direct-debit collection", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(
      rows([{ id: 50, student_id: 1, fee_period_id: 1, amount: "100.00", status: "pending_collection" }])
    );
    const res = await request(app).put("/api/fees/fees/50").set("Cookie", adminCookie).send({ amount: 120 });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/fees/fees/:feeId/simulate-collection", () => {
  it("404s when the fee record does not exist for this school", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/fees/fees/50/simulate-collection")
      .set("Cookie", adminCookie)
      .send({ outcome: "paid" });
    expect(res.status).toBe(404);
  });

  it("400s when the fee isn't awaiting collection", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(rows([{ id: 50, student_id: 1, fee_period_id: 1, amount: "100.00", status: "unpaid" }]));
    const res = await request(app)
      .post("/api/fees/fees/50/simulate-collection")
      .set("Cookie", adminCookie)
      .send({ outcome: "paid" });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid outcome", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce(
      rows([{ id: 50, student_id: 1, fee_period_id: 1, amount: "100.00", status: "pending_collection" }])
    );
    const res = await request(app)
      .post("/api/fees/fees/50/simulate-collection")
      .set("Cookie", adminCookie)
      .send({ outcome: "bogus" });
    expect(res.status).toBe(400);
  });

  it("simulates a successful collection", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 50, student_id: 1, fee_period_id: 1, amount: "100.00", status: "pending_collection" }]))
      .mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/fees/fees/50/simulate-collection")
      .set("Cookie", treasurerCookie)
      .send({ outcome: "paid" });
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining("status = 'paid'"), [50]);
  });

  it("simulates a failed collection with a reason", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 50, student_id: 1, fee_period_id: 1, amount: "100.00", status: "pending_collection" }]))
      .mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/fees/fees/50/simulate-collection")
      .set("Cookie", treasurerCookie)
      .send({ outcome: "failed", failure_reason: "Insufficient funds" });
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining("status = 'failed'"), ["Insufficient funds", 50]);
  });
});

describe("POST /api/fees/webhooks/direct-debit", () => {
  it("401s with no signature header", async () => {
    const res = await request(app)
      .post("/api/fees/webhooks/direct-debit")
      .send({ provider_payment_id: "stub_pay_1", event: "paid" });
    expect(res.status).toBe(401);
  });

  it("401s with an invalid signature", async () => {
    const res = await request(app)
      .post("/api/fees/webhooks/direct-debit")
      .set("X-Signature", "0".repeat(64))
      .send({ provider_payment_id: "stub_pay_1", event: "paid" });
    expect(res.status).toBe(401);
  });

  it("400s on an invalid payload", async () => {
    const payload = { provider_payment_id: "stub_pay_1", event: "bogus" };
    const res = await request(app)
      .post("/api/fees/webhooks/direct-debit")
      .set("X-Signature", signWebhook(payload))
      .send(payload);
    expect(res.status).toBe(400);
  });

  it("200s as a no-op for an unrecognized payment id", async () => {
    const payload = { provider_payment_id: "stub_pay_unknown", event: "paid" };
    mockQuery.mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/fees/webhooks/direct-debit")
      .set("X-Signature", signWebhook(payload))
      .send(payload);
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("transitions a matched fee from pending_collection to paid", async () => {
    const payload = { provider_payment_id: "stub_pay_99_abc", event: "paid" };
    mockQuery
      .mockResolvedValueOnce(rows([{ id: 99, status: "pending_collection" }]))
      .mockResolvedValueOnce(rows([]));
    const res = await request(app)
      .post("/api/fees/webhooks/direct-debit")
      .set("X-Signature", signWebhook(payload))
      .send(payload);
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining("status = 'paid'"), [99]);
  });

  it("is idempotent for a fee that's already settled", async () => {
    const payload = { provider_payment_id: "stub_pay_99_abc", event: "paid" };
    mockQuery.mockResolvedValueOnce(rows([{ id: 99, status: "paid" }]));
    const res = await request(app)
      .post("/api/fees/webhooks/direct-debit")
      .set("X-Signature", signWebhook(payload))
      .send(payload);
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(1); // no UPDATE fired
  });
});
