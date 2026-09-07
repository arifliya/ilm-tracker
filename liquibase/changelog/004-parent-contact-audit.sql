--liquibase formatted sql

--changeset ibrahim:004-parent-contact-audit
--comment: Lets a teacher see parent contact info for students in their own classes. Adds parent_contact_view_log so every time a teacher actually views a parent's contact details is recorded — this is PII being opened up to a role that couldn't see it before, so who looked at what and when needs to be reconstructable independently of the feature itself.

-- ============================
-- PARENT CONTACT VIEW LOG
-- One row per teacher viewing one student's parent contact info. FKs are
-- ON DELETE SET NULL (not CASCADE), same as feature_flag_audit_log, so
-- deleting a user/student/class/school later never erases the audit trail.
-- ============================

CREATE TABLE parent_contact_view_log (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_user_id INT NULL,
  student_id INT NULL,
  class_id INT NULL,
  school_id INT NULL,
  viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL
);

CREATE INDEX idx_pcvl_student ON parent_contact_view_log (student_id);
CREATE INDEX idx_pcvl_teacher ON parent_contact_view_log (teacher_user_id);
CREATE INDEX idx_pcvl_viewed_at ON parent_contact_view_log (viewed_at);

--rollback DROP TABLE IF EXISTS parent_contact_view_log;
