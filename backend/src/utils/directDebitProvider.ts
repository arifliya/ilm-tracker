import crypto from "crypto";
// Imported explicitly (rather than relying on the ambient global `Buffer`)
// because @cloudflare/workers-types and @types/node both declare a global
// `Buffer`, and letting TS pick between them loses Node's `toString(encoding)`
// overload — importing the value/type directly from "buffer" sidesteps it.
import { Buffer } from "buffer";

/* ============================================================
   DIRECT DEBIT PROVIDER — STUB IMPLEMENTATION

   This is the one module that talks to "the payment provider". Routes
   never call a provider SDK directly — they call the functions below, so
   swapping the stub for a real provider (e.g. GoCardless) later means
   rewriting this file only. The schema (payment_mandates, student_fees'
   provider_payment_id), the routes in fees.ts/parent.ts, and the frontend
   are all shaped around this same interface already and shouldn't need to
   change.

   No real bank/card details ever touch this app in either version — a
   real provider would redirect the parent to its own hosted mandate-setup
   flow and hand back an ID, same as createMandate below returns one
   synthetically.
   ============================================================ */

export interface ProviderMandate {
  providerCustomerId: string;
  providerMandateId: string;
}

export interface ProviderPayment {
  providerPaymentId: string;
}

// Stub: "creates" a customer + mandate instantly and marks it active. A
// real provider would return a redirect URL for the parent to complete a
// bank-authorization flow, and the mandate would land as 'pending' until a
// webhook confirms it — that's why payment_mandates.status still has a
// 'pending' state on the schema even though this stub never uses it.
export const createMandate = async (parentId: number): Promise<ProviderMandate> => {
  return {
    providerCustomerId: `stub_cust_${parentId}_${Buffer.from(crypto.randomBytes(4)).toString("hex")}`,
    providerMandateId: `stub_mandate_${Buffer.from(crypto.randomBytes(6)).toString("hex")}`
  };
};

// Stub: "submits" a payment against a mandate and hands back an ID the
// webhook will later reference. A real provider call here can fail
// synchronously (e.g. invalid mandate) — callers should treat a thrown
// error from this function as "submission failed, leave the fee as-is".
export const createPayment = async (
  providerMandateId: string,
  amount: number,
  feeId: number
): Promise<ProviderPayment> => {
  return {
    providerPaymentId: `stub_pay_${feeId}_${Buffer.from(crypto.randomBytes(6)).toString("hex")}`
  };
};

// HMAC-SHA256 over the raw request body, hex-encoded, compared with a
// timing-safe check — the shape GoCardless (and most providers) actually
// use for webhook signatures, so the real webhook route logic doesn't
// change when the stub is swapped out, only this verification function
// does.
export const verifyWebhookSignature = (
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string
): boolean => {
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(signatureHeader, "hex");
  if (expectedBuf.length !== givenBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, givenBuf);
};
