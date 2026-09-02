--liquibase formatted sql

--changeset ibrahim:005-must-reset-password
--comment: Lets an admin/owner/system_admin's password reset actually force a change, not just hand over a temp password the user could keep using indefinitely. must_reset_password starts FALSE for everyone; the reset-password endpoints set it TRUE, a login-time check redirects that user to a forced-change screen instead of their dashboard, and completing that screen clears it again.

ALTER TABLE users ADD COLUMN must_reset_password BOOLEAN NOT NULL DEFAULT FALSE;

--rollback ALTER TABLE users DROP COLUMN must_reset_password;
