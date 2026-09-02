"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../config/db");
const auth_1 = require("../middleware/auth");
const featureFlags_1 = require("../utils/featureFlags");
const asyncHandler_1 = require("../utils/asyncHandler");
const httpError_1 = require("../utils/httpError");
const directDebitProvider_1 = require("../utils/directDebitProvider");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// Deliberately narrower than the STAFF_MGMT-style groups elsewhere: fee
// tracking is admin + the dedicated treasurer role only — owner does not
// get it here, per the product decision behind this feature.
const FEES_MGMT = (0, auth_1.requireRole)("admin", "treasurer");
const requireFeesEnabled = async (req, res, next) => {
    if (!(await (0, featureFlags_1.isFeatureEnabled)("fees", req.user.schoolId))) {
        return res.status(403).json({ message: "Fee tracking is currently disabled for this school" });
    }
    next();
};
const isNonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const isValidAmount = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const loadFeePeriod = async (feePeriodId, schoolId) => {
    const [rows] = await db_1.pool.query("SELECT id, school_id, name FROM fee_periods WHERE id = ? AND school_id = ?", [feePeriodId, schoolId]);
    return rows[0] || null;
};
const loadFee = async (feeId, schoolId) => {
    const [rows] = await db_1.pool.query(`SELECT sf.id, sf.student_id, sf.fee_period_id, sf.amount, sf.status,
            sf.payment_method, sf.provider_payment_id, sf.failure_reason
     FROM student_fees sf
     JOIN fee_periods fp ON fp.id = sf.fee_period_id
     WHERE sf.id = ? AND fp.school_id = ?`, [feeId, schoolId]);
    return rows[0] || null;
};
// Picks the mandate to collect against when a student has more than one
// approved guardian: the guardian with the lowest parent_id who has an
// active mandate, for a deterministic (if arbitrary) choice — the plan
// this feature is built from only ever describes "the student's parent"
// singular, and multi-guardian collection ownership isn't something this
// pass tries to solve.
const findActiveMandateForStudent = async (studentId) => {
    const [rows] = await db_1.pool.query(`SELECT pm.provider_mandate_id
     FROM payment_mandates pm
     JOIN student_guardians sg ON sg.parent_id = pm.parent_id AND sg.status = 'approved'
     WHERE sg.student_id = ? AND pm.status = 'active'
     ORDER BY pm.parent_id ASC
     LIMIT 1`, [studentId]);
    return rows[0] || null;
};
// Submits one freshly-generated, still-unpaid fee for direct-debit
// collection if (and only if) its student has a parent with an active
// mandate. Never throws — a provider failure here just leaves the fee as
// manual/unpaid, same as if direct debit was never involved, so one bad
// submission can't fail the whole bulk-generate call.
const submitFeeForCollection = async (fee) => {
    const mandate = await findActiveMandateForStudent(fee.student_id);
    if (!mandate)
        return false;
    try {
        const payment = await (0, directDebitProvider_1.createPayment)(mandate.provider_mandate_id, Number(fee.amount), fee.id);
        await db_1.pool.query(`UPDATE student_fees
       SET status = 'pending_collection', payment_method = 'direct_debit', provider_payment_id = ?
       WHERE id = ? AND status = 'unpaid'`, [payment.providerPaymentId, fee.id]);
        return true;
    }
    catch (err) {
        logger_1.logger.warn({ err, feeId: fee.id }, "Direct debit submission failed — leaving fee as manual/unpaid");
        return false;
    }
};
// Shared by the real webhook route and the stub-only simulate-collection
// endpoint below, so both exercise the exact same transition logic.
// Idempotent: only ever transitions a fee out of pending_collection — a
// duplicate/replayed event for an already-settled fee is a silent no-op,
// since providers retry webhook delivery.
const applyProviderOutcome = async (fee, outcome, failureReason) => {
    if (fee.status !== "pending_collection")
        return;
    if (outcome === "paid") {
        await db_1.pool.query("UPDATE student_fees SET status = 'paid', paid_at = CURRENT_TIMESTAMP, failure_reason = NULL WHERE id = ?", [fee.id]);
    }
    else {
        await db_1.pool.query("UPDATE student_fees SET status = 'failed', failure_reason = ? WHERE id = ?", [failureReason && String(failureReason).trim() ? String(failureReason).trim() : "Payment failed", fee.id]);
    }
};
/* ============================================================
   LIST FEE PERIODS FOR THE CALLER'S SCHOOL
   ============================================================ */
router.get("/fee-periods", auth_1.authMiddleware, FEES_MGMT, requireFeesEnabled, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const [rows] = await db_1.pool.query("SELECT id, name, start_date, end_date FROM fee_periods WHERE school_id = ? ORDER BY start_date DESC", [req.user.schoolId]);
    res.json({ feePeriods: rows });
}));
/* ============================================================
   CREATE A FEE PERIOD
   ============================================================ */
router.post("/fee-periods", auth_1.authMiddleware, FEES_MGMT, requireFeesEnabled, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { name, start_date, end_date } = req.body;
    if (!isNonEmpty(name))
        return res.status(400).json({ message: "Period name is required" });
    if (!isNonEmpty(start_date) || !isNonEmpty(end_date)) {
        return res.status(400).json({ message: "Start date and end date are required" });
    }
    if (String(end_date) < String(start_date)) {
        return res.status(400).json({ message: "End date must be on or after the start date" });
    }
    let result;
    try {
        [result] = await db_1.pool.query("INSERT INTO fee_periods (school_id, name, start_date, end_date) VALUES (?, ?, ?, ?)", [req.user.schoolId, String(name).trim(), start_date, end_date]);
    }
    catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
            throw new httpError_1.HttpError(409, "A fee period with this name already exists");
        }
        throw err;
    }
    res.status(201).json({
        message: "Fee period created",
        feePeriod: { id: result.insertId, name: String(name).trim(), start_date, end_date }
    });
}));
/* ============================================================
   LIST CLASSES — FOR BUILDING THE PER-CLASS GENERATE FORM
   Deliberately its own minimal endpoint rather than reusing GET
   /admin/classes: that one is gated by STAFF_MGMT (admin/owner/
   system_admin), which doesn't include treasurer.
   ============================================================ */
router.get("/classes", auth_1.authMiddleware, FEES_MGMT, requireFeesEnabled, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const [rows] = await db_1.pool.query("SELECT id, class_name FROM classes WHERE school_id = ? ORDER BY class_name ASC", [req.user.schoolId]);
    res.json({ classes: rows });
}));
/* ============================================================
   LIST EVERY STUDENT'S FEE ROW FOR A PERIOD
   LEFT JOINed so a student with no fee row yet (period never generated
   for them) still appears, distinguishable from a genuinely unpaid row.
   GROUP_CONCAT'd (not a plain JOIN) because a student can be in more than
   one class — a plain join would return one row per class membership for
   the same fee, duplicating the student in the table.
   ============================================================ */
router.get("/fee-periods/:id/fees", auth_1.authMiddleware, FEES_MGMT, requireFeesEnabled, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const feePeriodId = Number(req.params.id);
    const period = await loadFeePeriod(feePeriodId, req.user.schoolId);
    if (!period)
        return res.status(404).json({ message: "Fee period not found" });
    const [rows] = await db_1.pool.query(`SELECT
         s.id AS student_id,
         s.first_name AS student_first_name,
         s.surname AS student_surname,
         GROUP_CONCAT(c.class_name ORDER BY c.class_name SEPARATOR ', ') AS class_name,
         sf.id AS fee_id,
         sf.amount AS amount,
         sf.status AS status,
         sf.payment_method AS payment_method,
         sf.failure_reason AS failure_reason,
         sf.paid_at AS paid_at
       FROM students s
       LEFT JOIN student_classes sc ON sc.student_id = s.id
       LEFT JOIN classes c ON c.id = sc.class_id
       LEFT JOIN student_fees sf ON sf.student_id = s.id AND sf.fee_period_id = ?
       WHERE s.school_id = ?
       GROUP BY s.id, sf.id
       ORDER BY s.surname ASC, s.first_name ASC`, [feePeriodId, req.user.schoolId]);
    res.json({ feePeriod: period, fees: rows });
}));
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
router.post("/fee-periods/:id/generate", auth_1.authMiddleware, FEES_MGMT, requireFeesEnabled, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const feePeriodId = Number(req.params.id);
    const { amounts } = req.body;
    const period = await loadFeePeriod(feePeriodId, req.user.schoolId);
    if (!period)
        return res.status(404).json({ message: "Fee period not found" });
    if (!Array.isArray(amounts) || amounts.length === 0) {
        return res.status(400).json({ message: "At least one class amount is required" });
    }
    for (const entry of amounts) {
        if (!Number.isInteger(entry?.class_id) || !isValidAmount(entry?.amount)) {
            return res.status(400).json({ message: "Each entry must have a valid class_id and a valid, non-negative amount" });
        }
    }
    // Only trust amounts for classes that actually belong to this school —
    // otherwise a caller could smuggle in a class_id from another school
    // even though every other lookup in this file is scoped that way.
    const requestedClassIds = amounts.map(a => a.class_id);
    const [classRows] = await db_1.pool.query("SELECT id FROM classes WHERE school_id = ? AND id IN (?)", [req.user.schoolId, requestedClassIds]);
    const validClassIds = new Set(classRows.map(r => r.id));
    const amountByClass = new Map();
    for (const entry of amounts) {
        if (validClassIds.has(entry.class_id))
            amountByClass.set(entry.class_id, entry.amount);
    }
    if (amountByClass.size === 0) {
        return res.status(400).json({ message: "No valid classes were provided" });
    }
    const [membershipRows] = await db_1.pool.query(`SELECT sc.student_id, sc.class_id
       FROM student_classes sc
       JOIN students s ON s.id = sc.student_id
       WHERE s.school_id = ? AND sc.class_id IN (?)`, [req.user.schoolId, Array.from(amountByClass.keys())]);
    const totalByStudent = new Map();
    for (const row of membershipRows) {
        const classAmount = amountByClass.get(row.class_id) ?? 0;
        totalByStudent.set(row.student_id, (totalByStudent.get(row.student_id) || 0) + classAmount);
    }
    if (totalByStudent.size === 0) {
        return res.json({ message: "No students found in the given classes", affectedRows: 0, submittedForCollection: 0 });
    }
    const [existingRows] = await db_1.pool.query("SELECT student_id FROM student_fees WHERE fee_period_id = ?", [feePeriodId]);
    const preExistingStudentIds = new Set(existingRows.map(r => r.student_id));
    const placeholders = [];
    const values = [];
    for (const [studentId, total] of totalByStudent) {
        placeholders.push("(?, ?, ?)");
        values.push(studentId, feePeriodId, total);
    }
    const [result] = await db_1.pool.query(`INSERT INTO student_fees (student_id, fee_period_id, amount)
       VALUES ${placeholders.join(", ")}
       ON DUPLICATE KEY UPDATE amount = amount`, values);
    let submittedForCollection = 0;
    if (await (0, featureFlags_1.isFeatureEnabled)("direct_debit", req.user.schoolId)) {
        const [newRows] = await db_1.pool.query("SELECT id, student_id, amount FROM student_fees WHERE fee_period_id = ? AND status = 'unpaid'", [feePeriodId]);
        for (const row of newRows) {
            if (preExistingStudentIds.has(row.student_id))
                continue;
            if (await submitFeeForCollection(row))
                submittedForCollection += 1;
        }
    }
    res.json({
        message: "Fees generated",
        affectedRows: result.affectedRows,
        submittedForCollection
    });
}));
/* ============================================================
   EDIT A STUDENT'S FEE AMOUNT — ONLY WHILE UNPAID
   ============================================================ */
router.put("/fees/:feeId", auth_1.authMiddleware, FEES_MGMT, requireFeesEnabled, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const feeId = Number(req.params.feeId);
    const { amount } = req.body;
    const fee = await loadFee(feeId, req.user.schoolId);
    if (!fee)
        return res.status(404).json({ message: "Fee record not found" });
    if (fee.status === "paid") {
        return res.status(400).json({ message: "This fee is already marked as paid — mark it unpaid before editing the amount" });
    }
    if (fee.status === "pending_collection") {
        return res.status(400).json({ message: "This fee has already been submitted for direct-debit collection at its current amount" });
    }
    if (!isValidAmount(amount))
        return res.status(400).json({ message: "A valid, non-negative amount is required" });
    await db_1.pool.query("UPDATE student_fees SET amount = ? WHERE id = ?", [amount, feeId]);
    res.json({ message: "Fee amount updated" });
}));
/* ============================================================
   MARK A FEE AS PAID
   ============================================================ */
router.post("/fees/:feeId/mark-paid", auth_1.authMiddleware, FEES_MGMT, requireFeesEnabled, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const feeId = Number(req.params.feeId);
    const fee = await loadFee(feeId, req.user.schoolId);
    if (!fee)
        return res.status(404).json({ message: "Fee record not found" });
    await db_1.pool.query("UPDATE student_fees SET status = 'paid', paid_at = CURRENT_TIMESTAMP, marked_paid_by_user_id = ? WHERE id = ?", [req.user.userId, feeId]);
    res.json({ message: "Marked as paid" });
}));
/* ============================================================
   MARK A FEE AS UNPAID (undo a mistake)
   Also resets it back to a plain manual fee — clearing payment_method/
   provider_payment_id/failure_reason — so a fee that was submitted for
   direct debit (or bounced) and then manually reset doesn't carry stale
   provider state around. It won't be auto-resubmitted; that only happens
   at generation time (see /fee-periods/:id/generate above).
   ============================================================ */
router.post("/fees/:feeId/mark-unpaid", auth_1.authMiddleware, FEES_MGMT, requireFeesEnabled, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const feeId = Number(req.params.feeId);
    const fee = await loadFee(feeId, req.user.schoolId);
    if (!fee)
        return res.status(404).json({ message: "Fee record not found" });
    await db_1.pool.query(`UPDATE student_fees
       SET status = 'unpaid', paid_at = NULL, marked_paid_by_user_id = NULL,
           payment_method = 'manual', provider_payment_id = NULL, failure_reason = NULL
       WHERE id = ?`, [feeId]);
    res.json({ message: "Marked as unpaid" });
}));
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
router.post("/fees/:feeId/simulate-collection", auth_1.authMiddleware, FEES_MGMT, requireFeesEnabled, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const feeId = Number(req.params.feeId);
    const fee = await loadFee(feeId, req.user.schoolId);
    if (!fee)
        return res.status(404).json({ message: "Fee record not found" });
    if (fee.status !== "pending_collection") {
        return res.status(400).json({ message: "This fee is not awaiting direct-debit collection" });
    }
    const { outcome, failure_reason } = req.body;
    if (outcome !== "paid" && outcome !== "failed") {
        return res.status(400).json({ message: "outcome must be 'paid' or 'failed'" });
    }
    await applyProviderOutcome(fee, outcome, failure_reason);
    res.json({ message: `Simulated provider webhook: ${outcome}` });
}));
/* ============================================================
   PROVIDER WEBHOOK — DIRECT DEBIT PAYMENT OUTCOME
   Unauthenticated (no session cookie applies to a server-to-server
   callback) — signature-verified instead via
   utils/directDebitProvider.verifyWebhookSignature, the one place a raw
   provider payload reaches this app. Not gated behind requireFeesEnabled/
   isFeatureEnabled: a payment already submitted before a flag was
   toggled off must still be able to settle.
   ============================================================ */
router.post("/webhooks/direct-debit", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const signature = req.header("X-Signature");
    if (!(0, directDebitProvider_1.verifyWebhookSignature)(req.rawBody || "", signature)) {
        return res.status(401).json({ message: "Invalid signature" });
    }
    const { provider_payment_id, event, failure_reason } = req.body || {};
    if (!isNonEmpty(provider_payment_id) || (event !== "paid" && event !== "failed")) {
        return res.status(400).json({ message: "Invalid webhook payload" });
    }
    const [rows] = await db_1.pool.query("SELECT id, status FROM student_fees WHERE provider_payment_id = ?", [provider_payment_id]);
    const fee = rows[0];
    // Unrecognized payment id, or already settled — acknowledge with 200
    // rather than an error so the provider doesn't retry indefinitely;
    // applyProviderOutcome is itself a no-op for an already-settled fee.
    if (fee)
        await applyProviderOutcome(fee, event, failure_reason);
    res.status(200).json({ message: "Webhook processed" });
}));
exports.default = router;
