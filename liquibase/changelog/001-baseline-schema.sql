--liquibase formatted sql

-- ============================
-- BASELINE SCHEMA
-- ============================
-- Squashed from the original changesets 001-014 (schools/roles/users
-- through the feature-flag audit log) into one changeset, since this
-- project has never been deployed anywhere but local dev — there was no
-- other environment's migration history to preserve. Changesets from 002
-- onward are additive on top of this and follow the normal rule: never
-- edit this file or any changeset once it has run anywhere, and never add
-- DROP TABLE/DROP COLUMN statements without a deliberate, reviewed
-- reason. If a change needs undoing, write a new changeset that reverses
-- it.

--changeset ibrahim:001-baseline-schema
--comment: Baseline schema — schools, roles, users, parents, staff_details, classes, teacher_classes, students, student_classes, student_guardians, tasks, attendance, student_notes, feature_flags, school_feature_flags, notifications, notification_recipients, school_terms, report_cards, report_card_subjects, timetable_slots, school_events, fee_periods, student_fees, feature_flag_audit_log. Squashed from the original changesets 001 (baseline) through 014 (feature-flag-audit-log) — see git history for the incremental story (report cards, timetable, multi-guardian support, analytics, fee tracking, password management, flag audit log) if you need it.

-- ============================
-- SCHOOLS
-- ============================

CREATE TABLE schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  school_code VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================
-- ROLES
-- ============================

CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO roles (name) VALUES
('system_admin'), ('owner'), ('maintainer'), ('admin'),
('teacher'), ('parent'), ('student'),
('staff'), ('pending'), ('treasurer');

-- ============================
-- USERS
-- ============================
-- school_id is NULL only for system_admin (a platform-level role that
-- isn't scoped to a single school). Every other role belongs to exactly
-- one school. Every seed account shares the dev password: Passw0rd!
-- token_version lets logout (and any future forced-revocation) invalidate
-- an already-issued JWT server-side: each token carries the
-- token_version that was current when it was signed, so bumping this
-- column invalidates every token issued before that point.

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  school_id INT NULL,
  requested_role VARCHAR(50) NULL,
  token_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (school_id) REFERENCES schools(id)
);

-- The one account this platform can bootstrap from — system_admin has no
-- school of its own, so it doesn't depend on any seed data existing.
INSERT INTO users (username, email, password_hash, role_id, school_id)
VALUES
('sysadmin', 'sysadmin@ilmschool.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='system_admin'), NULL);

-- ============================
-- PARENTS
-- ============================

CREATE TABLE parents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  school_id INT NOT NULL,
  first_name VARCHAR(100),
  middle_name VARCHAR(100),
  surname VARCHAR(100),
  relationship_to_student VARCHAR(50),
  date_of_birth DATE,
  address1 VARCHAR(255),
  address2 VARCHAR(255),
  address3 VARCHAR(255),
  city VARCHAR(100),
  postcode VARCHAR(20),
  medical_condition TEXT,
  contact_number VARCHAR(50),
  email VARCHAR(255),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (school_id) REFERENCES schools(id)
);

-- ============================
-- STAFF DETAILS
-- ============================

CREATE TABLE staff_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  school_id INT NULL,
  first_name VARCHAR(100),
  middle_name VARCHAR(100),
  surname VARCHAR(100),
  date_of_birth DATE,
  gender VARCHAR(20),
  address1 VARCHAR(255),
  address2 VARCHAR(255),
  address3 VARCHAR(255),
  city VARCHAR(100),
  postcode VARCHAR(20),
  medical_condition TEXT,
  disability TEXT,
  email VARCHAR(255),
  phone_number VARCHAR(50),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (school_id) REFERENCES schools(id)
);

INSERT INTO staff_details (user_id, school_id, first_name, surname, email)
VALUES (
  (SELECT id FROM users WHERE username='sysadmin'),
  NULL,
  'System', 'Admin', 'sysadmin@ilmschool.local'
);

-- ============================
-- CLASSES
-- ============================
-- class_code only needs to be unique within a school, so two schools can
-- both use a simple code like "7A" without colliding.

CREATE TABLE classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  class_name VARCHAR(255),
  class_code VARCHAR(30) NOT NULL,
  year_group VARCHAR(50),
  description TEXT NULL,
  FOREIGN KEY (school_id) REFERENCES schools(id),
  UNIQUE KEY uq_school_class_code (school_id, class_code)
);

-- ============================
-- TEACHER ↔ CLASS LINK
-- ============================

CREATE TABLE teacher_classes (
  teacher_id INT NOT NULL,
  class_id INT NOT NULL,
  PRIMARY KEY (teacher_id, class_id),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- ============================
-- STUDENTS
-- ============================
-- guardian_code lets a second guardian (e.g. a separated parent) self-
-- request linking to an existing child via student_guardians below,
-- rather than students belonging to a single mandatory parent.

CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  user_id INT NULL UNIQUE,
  first_name VARCHAR(100),
  middle_name VARCHAR(100),
  surname VARCHAR(100),
  gender VARCHAR(20),
  date_of_birth DATE,
  address1 VARCHAR(255),
  address2 VARCHAR(255),
  address3 VARCHAR(255),
  city VARCHAR(100),
  postcode VARCHAR(20),
  medical_condition TEXT,
  guardian_code CHAR(8) NOT NULL,
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uq_school_guardian_code (school_id, guardian_code)
);

-- ============================
-- STUDENT ↔ CLASS LINK
-- ============================

CREATE TABLE student_classes (
  student_id INT NOT NULL,
  class_id INT NOT NULL,
  PRIMARY KEY (student_id, class_id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- ============================
-- STUDENT ↔ GUARDIAN LINK
-- ============================
-- Many-to-many so two independent guardian logins (e.g. separated
-- parents) can both see the same child. 'pending' is a self-requested
-- link (via guardian_code) awaiting admin approval; a guardian added at
-- registration time is inserted straight in as 'approved'.

CREATE TABLE student_guardians (
  student_id INT NOT NULL,
  parent_id INT NOT NULL,
  status ENUM('pending', 'approved') NOT NULL DEFAULT 'approved',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  PRIMARY KEY (student_id, parent_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE
);

-- ============================
-- TASKS
-- ============================
-- student_id is NULL for an ordinary class-wide task. When set, the task is
-- "independent homework" set for just that one student (still tied to
-- class_id so the existing teacher/class ownership checks keep working).

CREATE TABLE tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  student_id INT NULL,
  title VARCHAR(255),
  description TEXT,
  due_date DATE,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- ============================
-- ATTENDANCE
-- ============================

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  student_id INT NOT NULL,
  date DATE NOT NULL,
  status ENUM('PRESENT', 'ABSENT') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendance_class FOREIGN KEY (class_id)
    REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id)
    REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY uq_attendance (class_id, student_id, date)
);

-- ============================
-- STUDENT NOTES
-- ============================
-- Private notes about a student, entered by staff from the attendance page.
-- Visible only to staff (teacher/staff/admin/owner/maintainer) at the
-- student's school and to that student's own parent — never to the student
-- themselves. Behind the "student_notes" feature flag.

CREATE TABLE student_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  author_user_id INT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id)
);

-- ============================
-- FEATURE FLAGS
-- ============================
-- The flag catalog is platform-wide (managed exclusively by system_admin),
-- but whether a flag is actually ON is decided per school via
-- school_feature_flags below. default_enabled is only the state a school
-- gets before system_admin has ever set an explicit override for it.

CREATE TABLE IF NOT EXISTS feature_flags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  feature_key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO feature_flags (feature_key, name, description, default_enabled)
VALUES
('attendance_report', 'Attendance Report', 'CSV export of class attendance for teachers, admins, and owners.', FALSE),
('notifications', 'Notifications', 'Lets admins/owners send notifications to parents or staff.', FALSE),
('student_notes', 'Student Notes & Independent Homework', 'Private per-student notes and individually assigned homework, set by staff from the attendance page and visible to staff and the student''s parent.', FALSE),
('report_cards', 'Report Cards', 'Per-subject grades and comments, organised by school term. Visible to admin, teacher, and parent — never the student.', FALSE),
('timetable', 'Timetable', 'Weekly class schedules and a school events calendar. Visible to admin and owner only.', FALSE),
('analytics_dashboard', 'Analytics Dashboard', 'Attendance trend and students-per-class charts for the current term. Visible to admin and owner only.', FALSE),
('fees', 'Fee Tracking', 'Monthly fee periods, per-student payment status, and mark-as-paid. Visible to admin and the treasurer role only.', FALSE),
('password_management', 'Password Management', 'Self-service password change for any logged-in user, and an admin-initiated password reset for locked-out accounts. No email is ever sent — reset passwords are shown once for the admin to relay directly.', FALSE);

-- ============================
-- SCHOOL FEATURE FLAG OVERRIDES
-- ============================
-- Explicit per-school on/off state, set exclusively by system_admin. A
-- school with no row here just inherits the flag's default_enabled.

CREATE TABLE school_feature_flags (
  school_id INT NOT NULL,
  feature_flag_id INT NOT NULL,
  enabled BOOLEAN NOT NULL,
  PRIMARY KEY (school_id, feature_flag_id),
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (feature_flag_id) REFERENCES feature_flags(id) ON DELETE CASCADE
);

-- ============================
-- FEATURE FLAG AUDIT LOG
-- ============================
-- Who created/updated/deleted a flag, or set/cleared a per-school
-- override, and when. feature_key is denormalized (kept even after the
-- flag row is gone) so history stays readable; the FKs are all ON DELETE
-- SET NULL rather than CASCADE so deleting a flag, school, or user never
-- silently erases audit history.

CREATE TABLE feature_flag_audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  feature_flag_id INT NULL,
  feature_key VARCHAR(100) NOT NULL,
  school_id INT NULL,
  action VARCHAR(30) NOT NULL,
  actor_user_id INT NULL,
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (feature_flag_id) REFERENCES feature_flags(id) ON DELETE SET NULL,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ffal_feature_flag (feature_flag_id),
  INDEX idx_ffal_school (school_id),
  INDEX idx_ffal_created_at (created_at)
);

-- ============================
-- NOTIFICATIONS
-- ============================
-- Sent to either every parent or every staff member (teacher/staff/admin/
-- owner/maintainer) in the sender's school. The recipient list is captured
-- at send time in notification_recipients so it stays accurate even if
-- school membership changes later.

CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  sender_user_id INT NOT NULL,
  audience ENUM('parent', 'staff') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id)
);

CREATE TABLE notification_recipients (
  notification_id INT NOT NULL,
  user_id INT NOT NULL,
  read_at TIMESTAMP NULL,
  PRIMARY KEY (notification_id, user_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================
-- SCHOOL TERMS
-- ============================
-- The grading periods report cards (and the timetable) are issued for
-- (e.g. "Term 1 2025-26"). Managed exclusively by admin, per school.

CREATE TABLE school_terms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  UNIQUE KEY uq_school_term_name (school_id, name)
);

-- ============================
-- REPORT CARDS
-- ============================
-- One per student per term. created_by_user_id is kept for audit purposes
-- even though it's not currently surfaced in the API response.

CREATE TABLE report_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  term_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (term_id) REFERENCES school_terms(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_report_card_student_term (student_id, term_id)
);

-- ============================
-- REPORT CARD SUBJECTS
-- ============================

CREATE TABLE report_card_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_card_id INT NOT NULL,
  subject_name VARCHAR(100) NOT NULL,
  grade VARCHAR(20) NOT NULL,
  comment TEXT NULL,
  FOREIGN KEY (report_card_id) REFERENCES report_cards(id) ON DELETE CASCADE
);

-- ============================
-- TIMETABLE SLOTS
-- ============================
-- One slot for one class on one specific calendar date (not a recurring
-- weekly pattern). term_id is denormalized from slot_date (whichever
-- school_terms row's date range contains it) for query convenience, but
-- isn't part of the natural key — slot_date alone determines it.

CREATE TABLE timetable_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  term_id INT NULL,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  subject_name VARCHAR(100) NULL,
  teacher_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_timetable_slots_term FOREIGN KEY (term_id) REFERENCES school_terms(id) ON DELETE CASCADE,
  UNIQUE KEY uq_timetable_slot (class_id, slot_date, start_time)
);

-- ============================
-- SCHOOL EVENTS
-- ============================
-- One-off dated events (INSET days, parents' evening, photo day, ...).
-- start_time/end_time are optional so an event can be all-day.

CREATE TABLE school_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  event_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

-- ============================
-- FEE PERIODS
-- ============================
-- Admin-defined billing periods (e.g. "September 2026"), same shape as
-- school_terms — explicit rows rather than auto-derived calendar months.

CREATE TABLE fee_periods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  UNIQUE KEY uq_fee_period_name (school_id, name)
);

-- ============================
-- STUDENT FEES
-- ============================
-- One row per student per fee period. Rows are bulk-generated by admin/
-- treasurer at a chosen amount, then individually marked paid/unpaid.
-- (002-direct-debit.sql adds payment_method/provider_payment_id/
-- failure_reason and widens status on top of this.)

CREATE TABLE student_fees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  fee_period_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
  paid_at TIMESTAMP NULL,
  marked_paid_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (fee_period_id) REFERENCES fee_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (marked_paid_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_student_fee_period (student_id, fee_period_id)
);

-- ============================
-- INDEXES
-- ============================

ALTER TABLE tasks ADD INDEX idx_tasks_class (class_id);
ALTER TABLE tasks ADD INDEX idx_tasks_student (student_id);
ALTER TABLE student_notes ADD INDEX idx_student_notes_student (student_id);
ALTER TABLE users ADD INDEX idx_users_school (school_id);
ALTER TABLE classes ADD INDEX idx_classes_school (school_id);
ALTER TABLE parents ADD INDEX idx_parents_school (school_id);
ALTER TABLE staff_details ADD INDEX idx_staff_details_school (school_id);
ALTER TABLE students ADD INDEX idx_students_school (school_id);
ALTER TABLE notifications ADD INDEX idx_notifications_school (school_id);
ALTER TABLE notification_recipients ADD INDEX idx_notification_recipients_user (user_id);
ALTER TABLE student_guardians ADD INDEX idx_student_guardians_parent (parent_id);
ALTER TABLE school_terms ADD INDEX idx_school_terms_school (school_id);
ALTER TABLE report_cards ADD INDEX idx_report_cards_student (student_id);
ALTER TABLE report_cards ADD INDEX idx_report_cards_term (term_id);
ALTER TABLE report_card_subjects ADD INDEX idx_report_card_subjects_card (report_card_id);
ALTER TABLE timetable_slots ADD INDEX idx_timetable_slots_class (class_id);
ALTER TABLE timetable_slots ADD INDEX idx_timetable_slots_teacher (teacher_id);
ALTER TABLE timetable_slots ADD INDEX idx_timetable_slots_term (term_id);
ALTER TABLE school_events ADD INDEX idx_school_events_school (school_id);
ALTER TABLE school_events ADD INDEX idx_school_events_date (event_date);
ALTER TABLE fee_periods ADD INDEX idx_fee_periods_school (school_id);
ALTER TABLE student_fees ADD INDEX idx_student_fees_period (fee_period_id);
ALTER TABLE student_fees ADD INDEX idx_student_fees_student (student_id);

--rollback DROP TABLE IF EXISTS student_fees, fee_periods, school_events, timetable_slots, report_card_subjects, report_cards, school_terms, notification_recipients, notifications, feature_flag_audit_log, school_feature_flags, feature_flags, student_notes, attendance, tasks, student_guardians, student_classes, students, teacher_classes, classes, staff_details, parents, users, roles, schools;
