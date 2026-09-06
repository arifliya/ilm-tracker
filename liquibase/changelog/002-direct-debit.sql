--liquibase formatted sql

--changeset ibrahim:002-direct-debit
--comment: Adds direct debit collection on top of Fee Tracking, behind a new "direct_debit" feature flag. A parent self-serves a payment mandate (one active row per parent); any fee generated afterwards for a student whose parent has an active mandate is automatically submitted for collection instead of staying manual/unpaid. Ships against a stub payment provider (backend/src/utils/directDebitProvider.ts) — no real bank/card details ever touch this app; a real provider (e.g. GoCardless) can be swapped in later behind that same module without a schema or route change.

-- ============================
-- PAYMENT MANDATES
-- One active row per parent — set up once, not per fee.
-- ============================

CREATE TABLE payment_mandates (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id INT NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'stub',
  provider_customer_id VARCHAR(255) NOT NULL,
  provider_mandate_id VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CONSTRAINT payment_mandates_status_check CHECK (status IN ('pending', 'active', 'cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP NULL,
  FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
  CONSTRAINT uq_payment_mandates_parent UNIQUE (parent_id)
);

-- ============================
-- STUDENT FEES — DIRECT DEBIT FIELDS
-- status gains pending_collection (submitted, awaiting provider
-- confirmation) and failed (bounced — insufficient funds, mandate
-- cancelled, ...). marked_paid_by_user_id was already nullable, which
-- now also covers a provider-confirmed payment with no human "marker".
--
-- The original status CHECK constraint (from 001) is dropped and
-- re-added widened, since Postgres has no in-place "MODIFY COLUMN"
-- equivalent for a CHECK's allowed values.
-- ============================

ALTER TABLE student_fees DROP CONSTRAINT student_fees_status_check;
ALTER TABLE student_fees ADD CONSTRAINT student_fees_status_check
  CHECK (status IN ('unpaid', 'paid', 'pending_collection', 'failed'));

ALTER TABLE student_fees
  ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT 'manual'
    CONSTRAINT student_fees_payment_method_check CHECK (payment_method IN ('manual', 'direct_debit')),
  ADD COLUMN provider_payment_id VARCHAR(255) NULL,
  ADD COLUMN failure_reason VARCHAR(255) NULL;

-- Nullable and unique — a fee submitted for collection gets one, a manual
-- fee never does, and the webhook looks a fee up by this column.
ALTER TABLE student_fees ADD CONSTRAINT uq_student_fees_provider_payment UNIQUE (provider_payment_id);

-- ============================
-- FEATURE FLAG
-- ============================

INSERT INTO feature_flags (feature_key, name, description, default_enabled)
VALUES (
  'direct_debit',
  'Direct Debit Collection',
  'Parent self-serve payment mandate setup, and automatic direct-debit collection of fees generated afterwards. Builds on Fee Tracking. Ships against a stub payment provider — no real bank/card details ever touch this app.',
  FALSE
);

-- ============================
-- INDEXES
-- ============================

CREATE INDEX idx_payment_mandates_status ON payment_mandates (status);

--rollback ALTER TABLE student_fees DROP CONSTRAINT uq_student_fees_provider_payment;
--rollback ALTER TABLE student_fees DROP COLUMN failure_reason, DROP COLUMN provider_payment_id, DROP COLUMN payment_method;
--rollback ALTER TABLE student_fees DROP CONSTRAINT student_fees_status_check;
--rollback ALTER TABLE student_fees ADD CONSTRAINT student_fees_status_check CHECK (status IN ('unpaid', 'paid'));
--rollback DROP TABLE IF EXISTS payment_mandates;
--rollback DELETE FROM feature_flags WHERE feature_key = 'direct_debit';
