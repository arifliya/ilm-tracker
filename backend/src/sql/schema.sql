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