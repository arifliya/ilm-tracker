import { Hono } from "hono";
import type { Context, Next } from "hono";
import type { AppEnv } from "../types/env";
import type { DbConnection } from "../config/db";
import { authMiddleware, requireRole } from "../middleware/auth";
import { isFeatureEnabled } from "../utils/featureFlags";
import { HttpError } from "../utils/httpError";
import { createPayment, verifyWebhookSignature } from "../utils/directDebitProvider";
import { logger } from "../utils/logger";
import { requireEnv } from "../config/env";

const router = new Hono<AppEnv>();

// Deliberately narrower than the STAFF_MGMT-style groups elsewhere: fee
// tracking is admin + the dedicated treasurer role only — owner does not
// get it here, per the product decision behind this feature.
const FEES_MGMT = requireRole("admin", "treasurer");

const requireFeesEnabled = async (c: Context<AppEnv>, next: Next) => {
  if (!(await isFeatureEnabled(c.get("db"), "fees", c.get("user")!.schoolId))) {
    return c.json({ message: "Fee tracking is currently disabled for this school" }, 403);
  }
  await next();
};

const isNonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

const isValidAmount = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;

interface IdRow {
  id: number;
}

interface FeePeriodRow {
  id: number;
  school_id: number;
  name: string;
}

// Postgres returns DECIMAL/NUMERIC columns as strings (to avoid float
// precision loss), not numbers — amount is typed to match, same reasoning
// as the COUNT(*)-as-string convention used elsewhere.
interface FeeRow {
  id: number;
  student_id: number;
  fee_period_id: number;
  amount: string;
  status: string;
  payment_method: string;
  provider_payment_id: string | null;
  failure_reason: string | null;
}

const loadFeePeriod = async (db: DbConnection, feePeriodId: number, schoolId: number | null): Promise<FeePeriodRow | null> => {
  const { rows } = await db.query<FeePeriodRow>(
    "SELECT id, school_id, name FROM fee_periods WHERE id = $1 AND school_id = $2",
    [feePeriodId, schoolId]
  );
  return rows[0] || null;
};

const loadFee = async (db: DbConnection, feeId: number, schoolId: number | null): Promise<FeeRow | null> => {
  const { rows } = await db.query<FeeRow>(
    `SELECT sf.id, sf.student_id, sf.fee_period_id, sf.amount, sf.status,
            sf.payment_method, sf.provider_payment_id, sf.failure_reason
     FROM student_fees sf
     JOIN fee_periods fp ON fp.id = sf.fee_period_id
     WHERE sf.id = $1 AND fp.school_id = $2`,
    [feeId, schoolId]
  );
  return rows[0] || null;
};

// Picks the mandate to collect against when a student has more than one
// approved guardian: the guardian with the lowest parent_id who has an
// active mandate, for a deterministic (if arbitrary) choice — the plan
// this feature is built from only ever describes "the student's parent"
// singular, and multi-guardian collection ownership isn't something this
// pass tries to solve.
interface MandateRow {
  provider_mandate_id: string;
}

const findActiveMandateForStudent = async (db: DbConnection, studentId: number): Promise<MandateRow | null> => {
  const { rows } = await db.query<MandateRow>(
    `SELECT pm.provider_mandate_id
     FROM payment_mandates pm
     JOIN student_guardians sg ON sg.parent_id = pm.parent_id AND sg.status = 'approved'
     WHERE sg.student_id = $1 AND pm.status = 'active'
     ORDER BY pm.parent_id ASC
     LIMIT 1`,
    [studentId]
  );
  return rows[0] || null;
};

// Submits one freshly-generated, still-unpaid fee for direct-debit
// collection if (and only if) its student has a parent with an active
// mandate. Never throws — a provider failure here just leaves the fee as
// manual/unpaid, same as if direct debit was never involved, so one bad
// submission can't fail the whole bulk-generate call.
const submitFeeForCollection = async (
  db: DbConnection,
  fee: { id: number; student_id: number; amount: string }
): Promise<boolean> => {
  const mandate = await findActiveMandateForStudent(db, fee.student_id);
  if (!mandate) return false;

  try {
    const payment = await createPayment(mandate.provider_mandate_id, Number(fee.amount), fee.id);
    await db.query(
      `UPDATE student_fees
       SET status = 'pending_collection', payment_method = 'direct_debit', provider_payment_id = $1
       WHERE id = $2 AND status = 'unpaid'`,
      [payment.providerPaymentId, fee.id]
    );
    return true;
  } catch (err) {
    logger.warn({ err, feeId: fee.id }, "Direct debit submission failed — leaving fee as manual/unpaid");
    return false;
  }
};

// Shared by the real webhook route and the stub-only simulate-collection
// endpoint below, so both exercise the exact same transition logic.
// Idempotent: only ever transitions a fee out of pending_collection — a
// duplicate/replayed event for an already-settled fee is a silent no-op,
// since providers retry webhook delivery.
const applyProviderOutcome = async (
  db: DbConnection,
  fee: { id: number; status: string },
  outcome: "paid" | "failed",
  failureReason?: string
) => {
  if (fee.status !== "pending_collection") return;

  if (outcome === "paid") {
    await db.query(
      "UPDATE student_fees SET status = 'paid', paid_at = CURRENT_TIMESTAMP, failure_reason = NULL WHERE id = $1",
      [fee.id]
    );
  } else {
    await db.query("UPDATE student_fees SET status = 'failed', failure_reason = $1 WHERE id = $2", [
      failureReason && String(failureReason).trim() ? String(failureReason).trim() : "Payment failed",
      fee.id
    ]);
  }
};

/* ============================================================
   LIST FEE PERIODS FOR THE CALLER'S SCHOOL
   ============================================================ */
interface FeePeriodListRow {
  id: number;
  name: string;
  start_date: Date;
  end_date: Date;
}

router.get("/fee-periods", authMiddleware, FEES_MGMT, requireFeesEnabled, async c => {
  const { rows } = await c
    .get("db")
    .query<FeePeriodListRow>(
      "SELECT id, name, start_date, end_date FROM fee_periods WHERE school_id = $1 ORDER BY start_date DESC",
      [c.get("user")!.schoolId]
    );
  return c.json({ feePeriods: rows });
});

/* ============================================================
   CREATE A FEE PERIOD
   ============================================================ */
router.post("/fee-periods", authMiddleware, FEES_MGMT, requireFeesEnabled, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const { name, start_date, end_date } = await c.req.json();
  if (!isNonEmpty(name)) return c.json({ message: "Period name is required" }, 400);
  if (!isNonEmpty(start_date) || !isNonEmpty(end_date)) {
    return c.json({ message: "Start date and end date are required" }, 400);
  }
  if (String(end_date) < String(start_date)) {
    return c.json({ message: "End date must be on or after the start date" }, 400);
  }

  let row: IdRow;
  try {
    ({
      rows: [row]
    } = await db.query<IdRow>(
      "INSERT INTO fee_periods (school_id, name, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING id",
      [user.schoolId, String(name).trim(), start_date, end_date]
    ));
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new HttpError(409, "A fee period with this name already exists");
    }
    throw err;
  }

  return c.json(
    {
      message: "Fee period created",
      feePeriod: { id: row.id, name: String(name).trim(), start_date, end_date }
    },
    201
  );
});

/* ============================================================
   LIST CLASSES — FOR BUILDING THE PER-CLASS GENERATE FORM
   Deliberately its own minimal endpoint rather than reusing GET
   /admin/classes: that one is gated by STAFF_MGMT (admin/owner/
   system_admin), which doesn't include treasurer.
   ============================================================ */
interface ClassRow {
  id: number;
  class_name: string;
}

router.get("/classes", authMiddleware, FEES_MGMT, requireFeesEnabled, async c => {
  const { rows } = await c
    .get("db")
    .query<ClassRow>("SELECT id, class_name FROM classes WHERE school_id = $1 ORDER BY class_name ASC", [
      c.get("user")!.schoolId
    ]);
  return c.json({ classes: rows });
});

/* ============================================================
   LIST EVERY STUDENT'S FEE ROW FOR A PERIOD
   LEFT JOINed so a student with no fee row yet (period never generated
   for them) still appears, distinguishable from a genuinely unpaid row.
   GROUP_CONCAT'd (not a plain JOIN) because a student can be in more than
   one class — a plain join would return one row per class membership for
   the same fee, duplicating the student in the table.
   ============================================================ */
interface StudentFeeListRow {
  student_id: number;
  student_first_name: string | null;
  student_surname: string | null;
  class_name: string | null;
  fee_id: number | null;
  amount: string | null;
  status: string | null;
  payment_method: string | null;
  failure_reason: string | null;
  paid_at: Date | null;
}

router.get("/fee-periods/:id/fees", authMiddleware, FEES_MGMT, requireFeesEnabled, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const feePeriodId = Number(c.req.param("id"));
  const period = await loadFeePeriod(db, feePeriodId, user.schoolId);
  if (!period) return c.json({ message: "Fee period not found" }, 404);

  const { rows } = await db.query<StudentFeeListRow>(
    `SELECT
       s.id AS student_id,
       s.first_name AS student_first_name,
       s.surname AS student_surname,
       string_agg(c.class_name, ', ' ORDER BY c.class_name) AS class_name,
       sf.id AS fee_id,
       sf.amount AS amount,
       sf.status AS status,
       sf.payment_method AS payment_method,
       sf.failure_reason AS failure_reason,
       sf.paid_at AS paid_at
     FROM students s
     LEFT JOIN student_classes sc ON sc.student_id = s.id
     LEFT JOIN classes c ON c.id = sc.class_id
     LEFT JOIN student_fees sf ON sf.student_id = s.id AND sf.fee_period_id = $1
     WHERE s.school_id = $2
     GROUP BY s.id, sf.id
     ORDER BY s.surname ASC, s.first_name ASC`,
    [feePeriodId, user.schoolId]
  );

  return c.json({ feePeriod: period, fees: rows });
});

/* ============================================================
   BULK-GENERATE FEES FOR A PERIOD — PER-CLASS AMOUNTS
   Body: { amounts: [{ class_id, amount }, ...] } — one amount per class,
   entered fresh for this period (not a persistent rate). A student's fee
   is the SUM of the amounts for every class they belong to (a student can
   be in more than one — e.g. their form class plus an after-school club
   — and each membership adds to their total); a student in none of the
   given classes gets no row at all, same as "not generated" today.

   Idempotent, same as before: a student who already has a row for this
   period is left untouched (their amount is not silently overwritten,
   and a paid row stays paid) — only students missing a row get one
   inserted.

   Behind "direct_debit": any row inserted just now (not a pre-existing
   one) for a student whose parent has an active mandate is immediately
   submitted for collection instead of sitting unpaid. This only ever
   fires at generation time — a mandate that becomes active later doesn't
   retroactively sweep up fees generated before it existed.
   ============================================================ */
interface ClassMembershipRow {
  student_id: number;
  class_id: number;
}

interface StudentIdRow {
  student_id: number;
}

interface GeneratedFeeRow {
  id: number;
  student_id: number;
  amount: string;
}

router.post("/fee-periods/:id/generate", authMiddleware, FEES_MGMT, requireFeesEnabled, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const feePeriodId = Number(c.req.param("id"));
  const { amounts } = await c.req.json();

  const period = await loadFeePeriod(db, feePeriodId, user.schoolId);
  if (!period) return c.json({ message: "Fee period not found" }, 404);

  if (!Array.isArray(amounts) || amounts.length === 0) {
    return c.json({ message: "At least one class amount is required" }, 400);
  }
  for (const entry of amounts) {
    if (!Number.isInteger(entry?.class_id) || !isValidAmount(entry?.amount)) {
      return c.json({ message: "Each entry must have a valid class_id and a valid, non-negative amount" }, 400);
    }
  }

  // Only trust amounts for classes that actually belong to this school —
  // otherwise a caller could smuggle in a class_id from another school
  // even though every other lookup in this file is scoped that way.
  const requestedClassIds = amounts.map((a: any) => a.class_id);
  const { rows: classRows } = await db.query<IdRow>("SELECT id FROM classes WHERE school_id = $1 AND id = ANY($2)", [
    user.schoolId,
    requestedClassIds
  ]);
  const validClassIds = new Set(classRows.map(r => r.id));

  const amountByClass = new Map<number, number>();
  for (const entry of amounts) {
    if (validClassIds.has(entry.class_id)) amountByClass.set(entry.class_id, entry.amount);
  }
  if (amountByClass.size === 0) {
    return c.json({ message: "No valid classes were provided" }, 400);
  }

  const { rows: membershipRows } = await db.query<ClassMembershipRow>(
    `SELECT sc.student_id, sc.class_id
     FROM student_classes sc
     JOIN students s ON s.id = sc.student_id
     WHERE s.school_id = $1 AND sc.class_id = ANY($2)`,
    [user.schoolId, Array.from(amountByClass.keys())]
  );

  const totalByStudent = new Map<number, number>();
  for (const row of membershipRows) {
    const classAmount = amountByClass.get(row.class_id) ?? 0;
    totalByStudent.set(row.student_id, (totalByStudent.get(row.student_id) || 0) + classAmount);
  }

  if (totalByStudent.size === 0) {
    return c.json({ message: "No students found in the given classes", affectedRows: 0, submittedForCollection: 0 });
  }

  const { rows: existingRows } = await db.query<StudentIdRow>(
    "SELECT student_id FROM student_fees WHERE fee_period_id = $1",
    [feePeriodId]
  );
  const preExistingStudentIds = new Set(existingRows.map(r => r.student_id));

  const placeholders: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  for (const [studentId, total] of totalByStudent) {
    placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
    values.push(studentId, feePeriodId, total);
    paramIndex += 3;
  }

  const { rowCount } = await db.query(
    `INSERT INTO student_fees (student_id, fee_period_id, amount)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (student_id, fee_period_id) DO NOTHING`,
    values
  );

  let submittedForCollection = 0;
  if (await isFeatureEnabled(db, "direct_debit", user.schoolId)) {
    const { rows: newRows } = await db.query<GeneratedFeeRow>(
      "SELECT id, student_id, amount FROM student_fees WHERE fee_period_id = $1 AND status = 'unpaid'",
      [feePeriodId]
    );
    for (const row of newRows) {
      if (preExistingStudentIds.has(row.student_id)) continue;
      if (await submitFeeForCollection(db, row)) submittedForCollection += 1;
    }
  }

  return c.json({
    message: "Fees generated",
    affectedRows: rowCount,
    submittedForCollection
  });
});

/* ============================================================
   EDIT A STUDENT'S FEE AMOUNT — ONLY WHILE UNPAID
   ============================================================ */
router.put("/fees/:feeId", authMiddleware, FEES_MGMT, requireFeesEnabled, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const feeId = Number(c.req.param("feeId"));
  const { amount } = await c.req.json();

  const fee = await loadFee(db, feeId, user.schoolId);
  if (!fee) return c.json({ message: "Fee record not found" }, 404);

  if (fee.status === "paid") {
    return c.json({ message: "This fee is already marked as paid — mark it unpaid before editing the amount" }, 400);
  }
  if (fee.status === "pending_collection") {
    return c.json(
      { message: "This fee has already been submitted for direct-debit collection at its current amount" },
      400
    );
  }

  if (!isValidAmount(amount)) return c.json({ message: "A valid, non-negative amount is required" }, 400);

  await db.query("UPDATE student_fees SET amount = $1 WHERE id = $2", [amount, feeId]);
  return c.json({ message: "Fee amount updated" });
});

/* ============================================================
   MARK A FEE AS PAID
   ============================================================ */
router.post("/fees/:feeId/mark-paid", authMiddleware, FEES_MGMT, requireFeesEnabled, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const feeId = Number(c.req.param("feeId"));
  const fee = await loadFee(db, feeId, user.schoolId);
  if (!fee) return c.json({ message: "Fee record not found" }, 404);

  await db.query(
    "UPDATE student_fees SET status = 'paid', paid_at = CURRENT_TIMESTAMP, marked_paid_by_user_id = $1 WHERE id = $2",
    [user.userId, feeId]
  );
  return c.json({ message: "Marked as paid" });
});

/* ============================================================
   MARK A FEE AS UNPAID (undo a mistake)
   Also resets it back to a plain manual fee — clearing payment_method/
   provider_payment_id/failure_reason — so a fee that was submitted for
   direct debit (or bounced) and then manually reset doesn't carry stale
   provider state around. It won't be auto-resubmitted; that only happens
   at generation time (see /fee-periods/:id/generate above).
   ============================================================ */
router.post("/fees/:feeId/mark-unpaid", authMiddleware, FEES_MGMT, requireFeesEnabled, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const feeId = Number(c.req.param("feeId"));
  const fee = await loadFee(db, feeId, user.schoolId);
  if (!fee) return c.json({ message: "Fee record not found" }, 404);

  await db.query(
    `UPDATE student_fees
     SET status = 'unpaid', paid_at = NULL, marked_paid_by_user_id = NULL,
         payment_method = 'manual', provider_payment_id = NULL, failure_reason = NULL
     WHERE id = $1`,
    [feeId]
  );
  return c.json({ message: "Marked as unpaid" });
});

/* ============================================================
   SIMULATE A PROVIDER WEBHOOK — STUB PROVIDER TEST HARNESS
   Lets admin/treasurer move a fee they submitted for collection to paid
   or failed without a real provider in the loop. Calls the exact same
   transition function the real webhook route (below) calls, so this
   isn't a shortcut around that logic — it's a stand-in for the provider
   actually calling it. Meaningful only while running against the stub
   provider; expected to be removed (or repurposed as a manual override
   tool) once a real provider is wired in.
   ============================================================ */
router.post("/fees/:feeId/simulate-collection", authMiddleware, FEES_MGMT, requireFeesEnabled, async c => {
  const db = c.get("db");
  const user = c.get("user")!;
  const feeId = Number(c.req.param("feeId"));
  const fee = await loadFee(db, feeId, user.schoolId);
  if (!fee) return c.json({ message: "Fee record not found" }, 404);

  if (fee.status !== "pending_collection") {
    return c.json({ message: "This fee is not awaiting direct-debit collection" }, 400);
  }

  const { outcome, failure_reason } = await c.req.json();
  if (outcome !== "paid" && outcome !== "failed") {
    return c.json({ message: "outcome must be 'paid' or 'failed'" }, 400);
  }

  await applyProviderOutcome(db, fee, outcome, failure_reason);
  return c.json({ message: `Simulated provider webhook: ${outcome}` });
});

/* ============================================================
   PROVIDER WEBHOOK — DIRECT DEBIT PAYMENT OUTCOME
   Unauthenticated (no session cookie applies to a server-to-server
   callback) — signature-verified instead via
   utils/directDebitProvider.verifyWebhookSignature, the one place a raw
   provider payload reaches this app. Not gated behind requireFeesEnabled/
   isFeatureEnabled: a payment already submitted before a flag was
   toggled off must still be able to settle.

   Reads the raw body via c.req.text() (not c.req.json()) because the HMAC
   is computed over the exact raw payload bytes — Hono has no equivalent
   of Express's express.json({verify}) hook for stashing raw bytes
   alongside a parsed body, and doesn't need one: body reads here are
   lazy/per-call, so only this one route needs the raw-text path.
   ============================================================ */
interface WebhookFeeRow {
  id: number;
  status: string;
}

router.post("/webhooks/direct-debit", async c => {
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Signature");
  const webhookSecret = requireEnv(c, "DIRECT_DEBIT_WEBHOOK_SECRET");
  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return c.json({ message: "Invalid signature" }, 401);
  }

  let body: any = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return c.json({ message: "Invalid webhook payload" }, 400);
  }

  const { provider_payment_id, event, failure_reason } = body;
  if (!isNonEmpty(provider_payment_id) || (event !== "paid" && event !== "failed")) {
    return c.json({ message: "Invalid webhook payload" }, 400);
  }

  const db = c.get("db");
  const { rows } = await db.query<WebhookFeeRow>("SELECT id, status FROM student_fees WHERE provider_payment_id = $1", [
    provider_payment_id
  ]);
  const fee = rows[0];
  // Unrecognized payment id, or already settled — acknowledge with 200
  // rather than an error so the provider doesn't retry indefinitely;
  // applyProviderOutcome is itself a no-op for an already-settled fee.
  if (fee) await applyProviderOutcome(db, fee, event, failure_reason);

  return c.json({ message: "Webhook processed" }, 200);
});

export default router;
