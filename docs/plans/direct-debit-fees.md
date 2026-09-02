# Adapting Fee Tracking for a Direct Debit Provider

**STATUS: IMPLEMENTED** — built on 2026-08-27, behind the `direct_debit`
feature flag, against a stub payment provider
(`backend/src/utils/directDebitProvider.ts`) rather than a real GoCardless/
Stripe integration — swapping in a real provider later only touches that
one module. Resolved the three open questions below as: parent self-serve
mandate setup (`POST /parent/direct-debit/mandate`), and automatic
submission for collection at fee-generation time (no manual per-fee
trigger). See `liquibase/changelog/015-direct-debit.sql`,
`backend/src/routes/fees.ts` (webhook + simulate-collection),
`backend/src/routes/parent.ts` (mandate endpoints),
`frontend/src/components/DirectDebitSection.tsx`. Full flow verified live
against the dev stack (mandate setup, auto-submission, webhook
signature-verification and idempotency, mandate cancellation). Builds on
the
existing Fee Tracking feature (`fee_periods` / `student_fees` tables,
`backend/src/routes/fees.ts`, `admin`/`treasurer` roles, `fees` feature flag).

## What changes conceptually

Right now `student_fees.status` is a two-state, admin-driven field
(`unpaid`/`paid`). With a real direct debit provider (GoCardless is the
common UK choice — mandates, BACS-style collection, webhooks), the source of
truth for "did this get paid" moves from a human click to provider events
arriving asynchronously, often days after collection is *initiated*. Manual
mark-as-paid doesn't disappear — it stays as the override path for
cash/bank-transfer payments and for correcting stuck records — but it stops
being the primary path.

## 1. New status lifecycle

`unpaid` → `pending_collection` → `paid`, with a `failed` state for bounced
payments (insufficient funds, mandate cancelled). This is the main
schema-shaped decision: a fee that's been submitted to the provider but not
yet cleared must be visibly different from one that's untouched, so admin
doesn't chase a parent who's already mid-payment.

## 2. Data model additions

- **`payment_mandates`** (new table): one per parent, `provider` (e.g.
  `gocardless`), `provider_customer_id`, `provider_mandate_id`, `status`
  (`active`/`cancelled`/`pending`), `created_at`. A parent sets this up
  once, not per fee.
- **`student_fees`** gets: `payment_method` (`manual` | `direct_debit`),
  `provider_payment_id` (nullable, set once submitted to the provider),
  `failure_reason` (nullable, populated on `failed`).
- `marked_paid_by_user_id` stays, but becomes nullable-and-optional — a
  provider-confirmed payment has no human "marker."

## 3. Submitting a fee for collection

New endpoint, e.g. `POST /fees/fees/:feeId/submit-for-collection`
(admin/treasurer) — looks up the student's parent's `payment_mandates` row,
calls the provider's API to create a payment against that mandate, stores
`provider_payment_id`, sets status to `pending_collection`. If there's no
active mandate, this 400s with a clear message rather than silently falling
back.

## 4. The provider webhook

A new unauthenticated (cookie-auth doesn't apply here) route, e.g.
`POST /fees/webhooks/gocardless`, that:

- Verifies the request signature against a secret (new `env.ts` entry,
  `required()` like `JWT_SECRET`) — this is the one place raw provider
  payloads reach the app, so signature checking isn't optional.
- Looks up the fee by `provider_payment_id`, transitions
  `pending_collection → paid` (setting `paid_at`) or `→ failed` (setting
  `failure_reason`).
- Is idempotent — providers retry webhooks, so a duplicate "paid" event for
  an already-paid fee should be a no-op, not an error.

## 5. Mandate setup (the parent-facing gap)

Parents currently have no portal-driven way to link a bank account. This
needs either: (a) admin/treasurer triggers a "send mandate setup link"
action that emails a provider-hosted signup flow (no card/bank details ever
touch this app — matches the "no PCI scope" pattern you'd want), or (b) a
parent-facing "Payment Details" section. (a) is far less work and avoids
ever needing an app-side redirect flow.

## 6. What stays the same

`fee_periods`, the bulk-generate action, the per-student list view, and the
admin/treasurer-only access model are all unaffected — this layers on top
rather than replacing them.

## Open questions before this becomes an implementation-ready plan

1. Which provider — GoCardless, Stripe (Direct Debit / BACS), something
   else? (Changes API shape, not the schema above.)
2. Who's responsible for getting a parent's mandate set up — admin triggers
   it, or parents self-serve?
3. Should `submit-for-collection` be a per-fee manual trigger, or should it
   auto-fire the moment a fee is generated for anyone with an active
   mandate?
