"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebhookSignature = exports.createPayment = exports.createMandate = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
// Stub: "creates" a customer + mandate instantly and marks it active. A
// real provider would return a redirect URL for the parent to complete a
// bank-authorization flow, and the mandate would land as 'pending' until a
// webhook confirms it — that's why payment_mandates.status still has a
// 'pending' state on the schema even though this stub never uses it.
const createMandate = async (parentId) => {
    return {
        providerCustomerId: `stub_cust_${parentId}_${crypto_1.default.randomBytes(4).toString("hex")}`,
        providerMandateId: `stub_mandate_${crypto_1.default.randomBytes(6).toString("hex")}`
    };
};
exports.createMandate = createMandate;
// Stub: "submits" a payment against a mandate and hands back an ID the
// webhook will later reference. A real provider call here can fail
// synchronously (e.g. invalid mandate) — callers should treat a thrown
// error from this function as "submission failed, leave the fee as-is".
const createPayment = async (providerMandateId, amount, feeId) => {
    return {
        providerPaymentId: `stub_pay_${feeId}_${crypto_1.default.randomBytes(6).toString("hex")}`
    };
};
exports.createPayment = createPayment;
// HMAC-SHA256 over the raw request body, hex-encoded, compared with a
// timing-safe check — the shape GoCardless (and most providers) actually
// use for webhook signatures, so the real webhook route logic doesn't
// change when the stub is swapped out, only this verification function
// does.
const verifyWebhookSignature = (rawBody, signatureHeader) => {
    if (!signatureHeader)
        return false;
    const expected = crypto_1.default
        .createHmac("sha256", env_1.env.DIRECT_DEBIT_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const givenBuf = Buffer.from(signatureHeader, "hex");
    if (expectedBuf.length !== givenBuf.length)
        return false;
    return crypto_1.default.timingSafeEqual(expectedBuf, givenBuf);
};
exports.verifyWebhookSignature = verifyWebhookSignature;
