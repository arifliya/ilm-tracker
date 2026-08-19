-- ============================
-- RESET DATABASE (CORRECT ORDER)
-- ============================
-- This file only sets up the schema and the one account needed to bootstrap
-- the platform (system_admin — the only role with no school, so it needs
-- no seed data to exist). Everything else (schools, staff, students,
-- classes, demo activity) lives in seed.sql, which mysql's
-- docker-entrypoint-initdb.d runs straight after this file (alphabetical
-- order: "init.sql" before "seed.sql").

DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS student_notes;
DROP TABLE IF EXISTS notification_recipients;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS school_feature_flags;
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS student_classes;
DROP TABLE IF EXISTS teacher_classes;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS parents;
DROP TABLE IF EXISTS staff_details;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS schools;

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
('staff'), ('pending');

-- ============================
-- USERS
-- ============================
-- school_id is NULL only for system_admin (a platform-level role that
-- isn't scoped to a single school). Every other role belongs to exactly
-- one school. Every seed account shares the dev password: Passw0rd!

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  school_id INT NULL,
  requested_role VARCHAR(50) NULL,
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

CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NOT NULL,
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
  FOREIGN KEY (parent_id) REFERENCES parents(id),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
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
-- The catalog itself is product configuration, not test data, so it lives
-- here rather than in seed.sql.

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
('new_attendance_ui', 'New Attendance UI', 'Rollout of the redesigned attendance register.', FALSE),
('beta_dashboard_theme', 'Beta Dashboard Theme', 'Experimental color theme for dashboards.', FALSE),
('attendance_report', 'Attendance Report', 'CSV export of class attendance for teachers, admins, and owners.', FALSE),
('notifications', 'Notifications', 'Lets admins/owners send notifications to parents or staff.', FALSE),
('student_notes', 'Student Notes & Independent Homework', 'Private per-student notes and individually assigned homework, set by staff from the attendance page and visible to staff and the student''s parent.', FALSE);

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
