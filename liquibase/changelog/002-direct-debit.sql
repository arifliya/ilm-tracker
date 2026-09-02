--liquibase formatted sql

--changeset ibrahim:002-direct-debit
--comment: Adds direct debit collection on top of Fee Tracking, behind a new "direct_debit" feature flag. A parent self-serves a payment mandate (one active row per parent); any fee generated afterwards for a student whose parent has an active mandate is automatically submitted for collection instead of staying manual/unpaid. Ships against a stub payment provider (backend/src/utils/directDebitProvider.ts) — no real bank/card details ever touch this app; a real provider (e.g. GoCardless) can be swapped in later behind that same module without a schema or route change.

-- ============================
-- PAYMENT MANDATES
-- One active row per parent — set up once, not per fee.
-- ============================

CREATE TABLE payment_mandates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'stub',
  provider_customer_id VARCHAR(255) NOT NULL,
  provider_mandate_id VARCHAR(255) NOT NULL,
  status ENUM('pending', 'active', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP NULL,
  FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
  UNIQUE KEY uq_payment_mandates_parent (parent_id)
);

-- ============================
-- STUDENT FEES — DIRECT DEBIT FIELDS
-- status gains pending_collection (submitted, awaiting provider
-- confirmation) and failed (bounced — insufficient funds, mandate
-- cancelled, ...). marked_paid_by_user_id was already nullable, which
-- now also covers a provider-confirmed payment with no human "marker".
-- ============================

ALTER TABLE student_fees
  MODIFY COLUMN status ENUM('unpaid', 'paid', 'pending_collection', 'failed') NOT NULL DEFAULT 'unpaid',
  ADD COLUMN payment_method ENUM('manual', 'direct_debit') NOT NULL DEFAULT 'manual' AFTER status,
  ADD COLUMN provider_payment_id VARCHAR(255) NULL AFTER payment_method,
  ADD COLUMN failure_reason VARCHAR(255) NULL AFTER provider_payment_id;

-- Nullable and unique — a fee submitted for collection gets one, a manual
-- fee never does, and the webhook looks a fee up by this column.
ALTER TABLE student_fees ADD UNIQUE KEY uq_student_fees_provider_payment (provider_payment_id);

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

ALTER TABLE payment_mandates ADD INDEX idx_payment_mandates_status (status);

--rollback ALTER TABLE student_fees DROP INDEX uq_student_fees_provider_payment;
--rollback ALTER TABLE student_fees DROP COLUMN failure_reason, DROP COLUMN provider_payment_id, DROP COLUMN payment_method;
--rollback ALTER TABLE student_fees MODIFY COLUMN status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid';
--rollback DROP TABLE IF EXISTS payment_mandates;
--rollback DELETE FROM feature_flags WHERE feature_key = 'direct_debit';
