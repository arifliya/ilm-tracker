-- Create database
CREATE DATABASE IF NOT EXISTS madressa_portal;
USE madressa_portal;

-- ============================
-- USERS TABLE
-- ============================
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  dob DATE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'teacher', 'student', 'owner') NOT NULL
);

-- ============================
-- CLASSES TABLE (updated schema)
-- ============================
DROP TABLE IF EXISTS classes;

CREATE TABLE classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT
);

-- ============================
-- CLASS_TEACHERS TABLE
-- ============================
DROP TABLE IF EXISTS class_teachers;

CREATE TABLE class_teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  teacher_id INT NOT NULL,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

-- ============================
-- CLASS_STUDENTS TABLE
-- ============================
DROP TABLE IF EXISTS class_students;

CREATE TABLE class_students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  student_id INT NOT NULL,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (student_id) REFERENCES users(id)
);

-- ============================
-- INSERT USERS (10 total)
-- 2 admins, 3 teachers, 5 students
-- ============================

INSERT INTO users (full_name, dob, email, password_hash, role) VALUES
('Ahmed Hassan', '1985-04-12', 'ahmed.hassan@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'admin'),
('Aisha Noor', '1982-09-21', 'aisha.noor@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'admin'),
('Omar Abdul', '1990-02-18', 'omar.abdul@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'teacher'),
('Fatima Zahra', '1988-07-30', 'fatima.zahra@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'teacher'),
('Yusuf Ibrahim', '1992-11-05', 'yusuf.ibrahim@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'teacher'),
('Maryam Khalid', '2007-03-14', 'maryam.khalid@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'student'),
('Ali Raza', '2006-12-01', 'ali.raza@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'student'),
('Zainab Binte', '2007-06-22', 'zainab.binte@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'student'),
('Ibrahim Tariq', '2006-09-09', 'ibrahim.tariq@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'student'),
('Noor Fatima', '2007-01-27', 'noor.fatima@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'student');

INSERT INTO users (full_name, dob, email, password_hash, role) VALUES
('Admin User', '1990-01-01', 'admin@example.com', '$2b$10$ZDkCwZRowp9FenwEPX71GuZxZSzvTKvX4rwy0SYTRy1GfRpjbPbVu', 'admin');

-- ============================
-- INSERT CLASSES (new schema)
-- ============================

INSERT INTO classes (name, description) VALUES
('Year 1 & 2', 'Basics'),
('Year 3 & 4', 'Mid'),
('Year 5 & 6', 'Advance');

-- ============================
-- ASSIGN TEACHERS
-- Teacher IDs = 3, 4, 5
-- ============================

INSERT INTO class_teachers (class_id, teacher_id) VALUES
(1, 3),
(2, 4),
(3, 5);

-- ============================
-- ENROLL STUDENTS
-- Student IDs = 6–10
-- ============================

INSERT INTO class_students (class_id, student_id) VALUES
(1, 6), (1, 7),
(2, 8), (2, 9),
(3, 10);
