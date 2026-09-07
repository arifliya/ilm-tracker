--liquibase formatted sql

--changeset ibrahim:003-performance-indexes
--comment: Performance indexes for two queries that scan by date range without a class/user filter to narrow them first — attendance report CSV export and the analytics attendance-trend chart (both admin.ts) scan by date across a whole school's attendance, and the sent-notifications list (notifications.ts) sorts by created_at across a whole school's notifications. attendance grows unboundedly (one row per student per class per school day), so this is the one table where the existing (class_id, student_id, date) unique key — date isn't leftmost — stops being enough once there's a few years of history. notifications grows far slower, but the same shape of fix removes a filesort as a school accumulates history.

-- ============================
-- ATTENDANCE — date range scans
-- ============================
-- uq_attendance(class_id, student_id, date) only helps when class_id is
-- already known. The school-wide CSV export and the analytics dashboard's
-- attendance-trend chart both filter by date range across every class in a
-- school, with no index to seek on — full table scan today, and it only
-- gets slower as attendance accumulates.

CREATE INDEX idx_attendance_date ON attendance (date);

-- ============================
-- NOTIFICATIONS — sent list ordering
-- ============================
-- idx_notifications_school covers the WHERE school_id = ? filter, but the
-- sent-notifications list then sorts by created_at, which isn't part of
-- that index — a filesort on every page load. Notification volume grows
-- far slower than attendance, but the fix is the same shape and just as
-- cheap, so it's included here too. The new composite index's leftmost
-- column already covers everything the old single-column one did, so it
-- replaces rather than joins it — no point paying the write overhead of
-- two indexes doing overlapping work.

-- Kept as add-then-drop (originally required by a MySQL FK-index-
-- dependency quirk that doesn't apply to Postgres) since the ordering is
-- harmless either way and keeps this changeset's history-following diff
-- minimal.
CREATE INDEX idx_notifications_school_created ON notifications (school_id, created_at);
DROP INDEX idx_notifications_school;

--rollback CREATE INDEX idx_notifications_school ON notifications (school_id);
--rollback DROP INDEX idx_notifications_school_created;
--rollback DROP INDEX idx_attendance_date;
