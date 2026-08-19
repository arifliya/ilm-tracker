-- ============================
-- DEMO / TEST DATA
-- ============================
-- Runs after init.sql (docker-entrypoint-initdb.d executes *.sql files in
-- this directory alphabetically, and "init.sql" sorts before "seed.sql").
-- init.sql already created the schema, the roles catalog, the feature flag
-- catalog, and the sysadmin account — this file only adds demo content on
-- top of that. Every account below shares the dev password: Passw0rd!

-- ============================
-- SCHOOLS
-- ============================

INSERT INTO schools (name, school_code) VALUES
('Ilm School', 'ILM2026'),
('Greenwood Academy', 'GRN2026');

-- ============================
-- USERS
-- ============================

-- Ilm School leadership + teaching staff
INSERT INTO users (username, email, password_hash, role_id, school_id)
VALUES
('owner1', 'margaret.ellison@ilmschool.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='owner'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('admin1', 'jonathan.reyes@ilmschool.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='admin'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('maintainer1', 'priya.chandran@ilmschool.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='maintainer'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('teacher1', 'daniel.foster@ilmschool.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='teacher'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('e.clarke', 'e.clarke@ilmschool.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='teacher'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('r.nguyen', 'r.nguyen@ilmschool.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='teacher'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('a.rahman', 'a.rahman@ilmschool.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='teacher'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('m.sullivan', 'm.sullivan@ilmschool.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='teacher'), (SELECT id FROM schools WHERE school_code='ILM2026'));

-- Ilm School parents
INSERT INTO users (username, email, password_hash, role_id, school_id)
VALUES
('parent1', 'aisha.khan@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('laura.bennett', 'laura.bennett@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('yusuf.mahmoud', 'yusuf.mahmoud@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('rachel.thompson', 'rachel.thompson@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('kwame.osei', 'kwame.osei@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('reema.patel', 'reema.patel@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('grace.wallace', 'grace.wallace@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('bilal.hussain', 'bilal.hussain@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('elena.novak', 'elena.novak@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('craig.douglas', 'craig.douglas@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('farida.ahmed', 'farida.ahmed@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('michael.carter', 'michael.carter@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('harpreet.singh', 'harpreet.singh@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('tom.lewis', 'tom.lewis@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('karen.bailey', 'karen.bailey@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('amanda.kelly', 'amanda.kelly@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('susan.price', 'susan.price@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='ILM2026'));

-- Ilm School students (logins)
INSERT INTO users (username, password_hash, role_id, school_id)
VALUES
('adamk', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('sarak', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('zainabm', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('laylaa', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('oliverb', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('charlottet', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('sophiel', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('niao', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('aryanp', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('jackb', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('ethanw', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('chloek', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('ibrahimm', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('maryamh', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('filipn', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('ryand', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('yusufa', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('danielp', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('kiranp', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('isabellec', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026')),
('simrans', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='ILM2026'));

-- Greenwood Academy: leadership, teacher, parents
INSERT INTO users (username, email, password_hash, role_id, school_id)
VALUES
('owner2', 'olivia.green@greenwood.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='owner'), (SELECT id FROM schools WHERE school_code='GRN2026')),
('t.khalid', 't.khalid@greenwood.local', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='teacher'), (SELECT id FROM schools WHERE school_code='GRN2026')),
('helen.turner', 'helen.turner@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='GRN2026')),
('samuel.osei-mensah', 'samuel.osei-mensah@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='GRN2026')),
('fatima.zahra', 'fatima.zahra@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='parent'), (SELECT id FROM schools WHERE school_code='GRN2026'));

-- Greenwood Academy: students (logins)
INSERT INTO users (username, password_hash, role_id, school_id)
VALUES
('lilyt', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='GRN2026')),
('graceo', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='GRN2026')),
('danielo', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='GRN2026')),
('aliz', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='student'), (SELECT id FROM schools WHERE school_code='GRN2026'));

-- ============================
-- PARENTS
-- ============================

INSERT INTO parents (
  user_id, school_id, first_name, middle_name, surname, relationship_to_student,
  date_of_birth, address1, city, postcode, medical_condition, contact_number, email
)
VALUES
((SELECT id FROM users WHERE username='parent1'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Aisha', NULL, 'Khan', 'mother', '1985-01-01', '12 Maple Street', 'Leicester', 'LE1 2AB', NULL, '07123456789', 'aisha.khan@example.com'),
((SELECT id FROM users WHERE username='laura.bennett'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Laura', NULL, 'Bennett', 'mother', '1983-03-12', '24 Fosse Road North', 'Leicester', 'LE3 5AH', NULL, '07700900101', 'laura.bennett@example.com'),
((SELECT id FROM users WHERE username='yusuf.mahmoud'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Yusuf', NULL, 'Mahmoud', 'father', '1980-11-05', '8 Narborough Road', 'Leicester', 'LE3 0PB', NULL, '07700900102', 'yusuf.mahmoud@example.com'),
((SELECT id FROM users WHERE username='rachel.thompson'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Rachel', NULL, 'Thompson', 'mother', '1986-07-22', '45 Aylestone Road', 'Leicester', 'LE2 7LN', NULL, '07700900103', 'rachel.thompson@example.com'),
((SELECT id FROM users WHERE username='kwame.osei'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Kwame', NULL, 'Osei', 'father', '1981-09-30', '3 Uppingham Road', 'Leicester', 'LE5 0QF', NULL, '07700900104', 'kwame.osei@example.com'),
((SELECT id FROM users WHERE username='reema.patel'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Reema', NULL, 'Patel', 'mother', '1979-02-14', '67 Melton Road', 'Leicester', 'LE4 5EA', 'Mild asthma (inhaler kept at school office)', '07700900105', 'reema.patel@example.com'),
((SELECT id FROM users WHERE username='grace.wallace'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Grace', NULL, 'Wallace', 'mother', '1984-05-18', '19 Hinckley Road', 'Leicester', 'LE3 0RA', NULL, '07700900106', 'grace.wallace@example.com'),
((SELECT id FROM users WHERE username='bilal.hussain'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Bilal', NULL, 'Hussain', 'father', '1982-12-01', '5 Gipsy Lane', 'Leicester', 'LE4 6RB', NULL, '07700900107', 'bilal.hussain@example.com'),
((SELECT id FROM users WHERE username='elena.novak'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Elena', NULL, 'Novak', 'mother', '1985-08-09', '31 Welford Road', 'Leicester', 'LE2 6EH', NULL, '07700900108', 'elena.novak@example.com'),
((SELECT id FROM users WHERE username='craig.douglas'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Craig', NULL, 'Douglas', 'father', '1978-04-27', '14 Evington Road', 'Leicester', 'LE2 1HL', NULL, '07700900109', 'craig.douglas@example.com'),
((SELECT id FROM users WHERE username='farida.ahmed'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Farida', NULL, 'Ahmed', 'mother', '1980-06-16', '9 Clarendon Park Road', 'Leicester', 'LE2 3AH', 'Peanut allergy in family — please check snacks sent in for siblings', '07700900110', 'farida.ahmed@example.com'),
((SELECT id FROM users WHERE username='michael.carter'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Michael', NULL, 'Carter', 'father', '1977-10-11', '22 Queens Road', 'Leicester', 'LE2 1TT', NULL, '07700900111', 'michael.carter@example.com'),
((SELECT id FROM users WHERE username='harpreet.singh'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Harpreet', NULL, 'Singh', 'father', '1979-01-25', '6 Knighton Road', 'Leicester', 'LE2 3HU', NULL, '07700900112', 'harpreet.singh@example.com'),
((SELECT id FROM users WHERE username='tom.lewis'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Tom', NULL, 'Lewis', 'father', '1984-03-03', '40 London Road', 'Leicester', 'LE2 1ND', NULL, '07700900113', 'tom.lewis@example.com'),
((SELECT id FROM users WHERE username='karen.bailey'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Karen', NULL, 'Bailey', 'mother', '1983-11-19', '2 Victoria Park Road', 'Leicester', 'LE2 1XA', NULL, '07700900114', 'karen.bailey@example.com'),
((SELECT id FROM users WHERE username='amanda.kelly'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Amanda', NULL, 'Kelly', 'mother', '1986-02-08', '17 Ashby Road', 'Leicester', 'LE1 8ZP', NULL, '07700900115', 'amanda.kelly@example.com'),
((SELECT id FROM users WHERE username='susan.price'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Susan', NULL, 'Price', 'mother', '1981-07-07', '28 Charnwood Street', 'Leicester', 'LE2 1TB', NULL, '07700900116', 'susan.price@example.com'),
((SELECT id FROM users WHERE username='helen.turner'), (SELECT id FROM schools WHERE school_code='GRN2026'),
 'Helen', NULL, 'Turner', 'mother', '1987-05-21', '5 Ashby Road', 'Loughborough', 'LE11 3AA', NULL, '07700900201', 'helen.turner@example.com'),
((SELECT id FROM users WHERE username='samuel.osei-mensah'), (SELECT id FROM schools WHERE school_code='GRN2026'),
 'Samuel', NULL, 'Osei-Mensah', 'father', '1982-09-14', '18 Forest Road', 'Loughborough', 'LE11 4TX', NULL, '07700900202', 'samuel.osei-mensah@example.com'),
((SELECT id FROM users WHERE username='fatima.zahra'), (SELECT id FROM schools WHERE school_code='GRN2026'),
 'Fatima', NULL, 'Zahra', 'mother', '1985-12-30', '9 Church Gate', 'Loughborough', 'LE11 1TX', NULL, '07700900203', 'fatima.zahra@example.com');

-- ============================
-- STAFF DETAILS
-- ============================
-- (sysadmin's row already exists — it was inserted by init.sql.)

INSERT INTO staff_details (user_id, school_id, first_name, surname, gender, address1, city, postcode, email, phone_number)
VALUES
((SELECT id FROM users WHERE username='owner1'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Margaret', 'Ellison', 'Female', '3 Victoria Park Road', 'Leicester', 'LE2 1XA', 'margaret.ellison@ilmschool.local', '07700900001'),
((SELECT id FROM users WHERE username='admin1'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Jonathan', 'Reyes', 'Male', '15 Evington Road', 'Leicester', 'LE2 1HL', 'jonathan.reyes@ilmschool.local', '07700900002'),
((SELECT id FROM users WHERE username='maintainer1'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Priya', 'Chandran', 'Female', '27 Clarendon Park Road', 'Leicester', 'LE2 3AH', 'priya.chandran@ilmschool.local', '07700900003'),
((SELECT id FROM users WHERE username='teacher1'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Daniel', 'Foster', 'Male', '8 Queens Road', 'Leicester', 'LE2 1TT', 'daniel.foster@ilmschool.local', '07700900004'),
((SELECT id FROM users WHERE username='e.clarke'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Emily', 'Clarke', 'Female', '41 London Road', 'Leicester', 'LE2 1ND', 'e.clarke@ilmschool.local', '07700900005'),
((SELECT id FROM users WHERE username='r.nguyen'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Robert', 'Nguyen', 'Male', '6 Knighton Road', 'Leicester', 'LE2 3HU', 'r.nguyen@ilmschool.local', '07700900006'),
((SELECT id FROM users WHERE username='a.rahman'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Aisha', 'Rahman', 'Female', '19 Welford Road', 'Leicester', 'LE2 6EH', 'a.rahman@ilmschool.local', '07700900007'),
((SELECT id FROM users WHERE username='m.sullivan'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Mark', 'Sullivan', 'Male', '33 Narborough Road', 'Leicester', 'LE3 0PE', 'm.sullivan@ilmschool.local', '07700900008'),
((SELECT id FROM users WHERE username='owner2'), (SELECT id FROM schools WHERE school_code='GRN2026'),
 'Olivia', 'Green', 'Female', '12 Leicester Road', 'Loughborough', 'LE11 2AB', 'olivia.green@greenwood.local', '07700900200'),
((SELECT id FROM users WHERE username='t.khalid'), (SELECT id FROM schools WHERE school_code='GRN2026'),
 'Tariq', 'Khalid', 'Male', '22 Leicester Road', 'Loughborough', 'LE11 2AB', 't.khalid@greenwood.local', '07700900204');

-- ============================
-- CLASSES
-- ============================

INSERT INTO classes (school_id, class_name, class_code, year_group, description)
VALUES
((SELECT id FROM schools WHERE school_code='ILM2026'), 'Year 7A', '7A', 'Year 7', 'Form tutor: Daniel Foster'),
((SELECT id FROM schools WHERE school_code='ILM2026'), 'Year 7B', '7B', 'Year 7', 'Form tutor: Mark Sullivan'),
((SELECT id FROM schools WHERE school_code='ILM2026'), 'Year 8A', '8A', 'Year 8', 'Form tutor: Emily Clarke'),
((SELECT id FROM schools WHERE school_code='ILM2026'), 'Year 8B', '8B', 'Year 8', 'Form tutor: Emily Clarke'),
((SELECT id FROM schools WHERE school_code='ILM2026'), 'Year 9A', '9A', 'Year 9', 'Form tutor: Robert Nguyen'),
((SELECT id FROM schools WHERE school_code='ILM2026'), 'Year 10A', '10A', 'Year 10', 'Form tutor: Robert Nguyen — GCSE options group'),
((SELECT id FROM schools WHERE school_code='ILM2026'), 'Year 11A', '11A', 'Year 11', 'Form tutor: Aisha Rahman — GCSE exam year'),
((SELECT id FROM schools WHERE school_code='GRN2026'), 'Year 5', '5Y', 'Year 5', 'Class teacher: Tariq Khalid'),
((SELECT id FROM schools WHERE school_code='GRN2026'), 'Year 6', '6Y', 'Year 6', 'Class teacher: Tariq Khalid');

-- ============================
-- TEACHER ↔ CLASS LINK
-- ============================

INSERT INTO teacher_classes (teacher_id, class_id)
VALUES
((SELECT id FROM users WHERE username='teacher1'), (SELECT id FROM classes WHERE class_code='7A')),
((SELECT id FROM users WHERE username='m.sullivan'), (SELECT id FROM classes WHERE class_code='7B')),
((SELECT id FROM users WHERE username='e.clarke'), (SELECT id FROM classes WHERE class_code='8A')),
((SELECT id FROM users WHERE username='e.clarke'), (SELECT id FROM classes WHERE class_code='8B')),
((SELECT id FROM users WHERE username='r.nguyen'), (SELECT id FROM classes WHERE class_code='9A')),
((SELECT id FROM users WHERE username='r.nguyen'), (SELECT id FROM classes WHERE class_code='10A')),
((SELECT id FROM users WHERE username='a.rahman'), (SELECT id FROM classes WHERE class_code='11A')),
((SELECT id FROM users WHERE username='t.khalid'), (SELECT id FROM classes WHERE class_code='5Y')),
((SELECT id FROM users WHERE username='t.khalid'), (SELECT id FROM classes WHERE class_code='6Y'));

-- ============================
-- STUDENTS
-- ============================

-- Year 7A
INSERT INTO students (parent_id, school_id, user_id, first_name, surname, gender, date_of_birth, address1, city, postcode)
VALUES
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='parent1')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='adamk'),
 'Adam', 'Khan', 'male', '2014-06-10', '12 Maple Street', 'Leicester', 'LE1 2AB'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='yusuf.mahmoud')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='zainabm'),
 'Zainab', 'Mahmoud', 'female', '2014-02-18', '8 Narborough Road', 'Leicester', 'LE3 0PB'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='farida.ahmed')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='laylaa'),
 'Layla', 'Ahmed', 'female', '2013-11-30', '9 Clarendon Park Road', 'Leicester', 'LE2 3AH');

-- Year 7B
INSERT INTO students (parent_id, school_id, user_id, first_name, surname, gender, date_of_birth, address1, city, postcode)
VALUES
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='laura.bennett')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='oliverb'),
 'Oliver', 'Bennett', 'male', '2014-08-05', '24 Fosse Road North', 'Leicester', 'LE3 5AH'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='rachel.thompson')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='charlottet'),
 'Charlotte', 'Thompson', 'female', '2014-01-22', '45 Aylestone Road', 'Leicester', 'LE2 7LN'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='tom.lewis')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='sophiel'),
 'Sophie', 'Lewis', 'female', '2014-04-14', '40 London Road', 'Leicester', 'LE2 1ND');

-- Year 8A
INSERT INTO students (parent_id, school_id, user_id, first_name, surname, gender, date_of_birth, address1, city, postcode, medical_condition)
VALUES
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='kwame.osei')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='niao'),
 'Nia', 'Osei', 'female', '2013-03-09', '3 Uppingham Road', 'Leicester', 'LE5 0QF', NULL),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='reema.patel')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='aryanp'),
 'Aryan', 'Patel', 'male', '2013-07-27', '67 Melton Road', 'Leicester', 'LE4 5EA', 'Mild asthma — inhaler kept in school office'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='karen.bailey')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='jackb'),
 'Jack', 'Bailey', 'male', '2013-12-01', '2 Victoria Park Road', 'Leicester', 'LE2 1XA', NULL);

-- Year 8B
INSERT INTO students (parent_id, school_id, user_id, first_name, surname, gender, date_of_birth, address1, city, postcode)
VALUES
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='parent1')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='sarak'),
 'Sara', 'Khan', 'female', '2013-11-22', '12 Maple Street', 'Leicester', 'LE1 2AB'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='grace.wallace')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='ethanw'),
 'Ethan', 'Wallace', 'male', '2013-05-16', '19 Hinckley Road', 'Leicester', 'LE3 0RA'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='amanda.kelly')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='chloek'),
 'Chloe', 'Kelly', 'female', '2013-09-08', '17 Ashby Road', 'Leicester', 'LE1 8ZP');

-- Year 9A
INSERT INTO students (parent_id, school_id, user_id, first_name, surname, gender, date_of_birth, address1, city, postcode, medical_condition)
VALUES
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='yusuf.mahmoud')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='ibrahimm'),
 'Ibrahim', 'Mahmoud', 'male', '2012-06-25', '8 Narborough Road', 'Leicester', 'LE3 0PB', NULL),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='bilal.hussain')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='maryamh'),
 'Maryam', 'Hussain', 'female', '2012-02-14', '5 Gipsy Lane', 'Leicester', 'LE4 6RB', 'Type 1 diabetes — care plan on file with school nurse'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='elena.novak')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='filipn'),
 'Filip', 'Novak', 'male', '2012-10-03', '31 Welford Road', 'Leicester', 'LE2 6EH', NULL);

-- Year 10A
INSERT INTO students (parent_id, school_id, user_id, first_name, surname, gender, date_of_birth, address1, city, postcode)
VALUES
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='craig.douglas')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='ryand'),
 'Ryan', 'Douglas', 'male', '2011-04-19', '14 Evington Road', 'Leicester', 'LE2 1HL'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='farida.ahmed')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='yusufa'),
 'Yusuf', 'Ahmed', 'male', '2011-08-30', '9 Clarendon Park Road', 'Leicester', 'LE2 3AH'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='susan.price')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='danielp'),
 'Daniel', 'Price', 'male', '2011-01-12', '28 Charnwood Street', 'Leicester', 'LE2 1TB');

-- Year 11A
INSERT INTO students (parent_id, school_id, user_id, first_name, surname, gender, date_of_birth, address1, city, postcode)
VALUES
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='reema.patel')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='kiranp'),
 'Kiran', 'Patel', 'female', '2010-09-21', '67 Melton Road', 'Leicester', 'LE4 5EA'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='michael.carter')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='isabellec'),
 'Isabelle', 'Carter', 'female', '2010-03-15', '22 Queens Road', 'Leicester', 'LE2 1TT'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='harpreet.singh')), (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='simrans'),
 'Simran', 'Singh', 'female', '2010-12-06', '6 Knighton Road', 'Leicester', 'LE2 3HU');

-- Greenwood Academy: Year 5 & Year 6
INSERT INTO students (parent_id, school_id, user_id, first_name, surname, gender, date_of_birth, address1, city, postcode)
VALUES
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='helen.turner')), (SELECT id FROM schools WHERE school_code='GRN2026'), (SELECT id FROM users WHERE username='lilyt'),
 'Lily', 'Turner', 'female', '2016-05-11', '5 Ashby Road', 'Loughborough', 'LE11 3AA'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='samuel.osei-mensah')), (SELECT id FROM schools WHERE school_code='GRN2026'), (SELECT id FROM users WHERE username='graceo'),
 'Grace', 'Osei-Mensah', 'female', '2016-08-24', '18 Forest Road', 'Loughborough', 'LE11 4TX'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='samuel.osei-mensah')), (SELECT id FROM schools WHERE school_code='GRN2026'), (SELECT id FROM users WHERE username='danielo'),
 'Daniel', 'Osei-Mensah', 'male', '2015-02-17', '18 Forest Road', 'Loughborough', 'LE11 4TX'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='fatima.zahra')), (SELECT id FROM schools WHERE school_code='GRN2026'), (SELECT id FROM users WHERE username='aliz'),
 'Ali', 'Zahra', 'male', '2015-06-29', '9 Church Gate', 'Loughborough', 'LE11 1TX');

-- ============================
-- STUDENT ↔ CLASS LINK
-- ============================

INSERT INTO student_classes (student_id, class_id)
VALUES
((SELECT id FROM students WHERE first_name='Adam' AND surname='Khan'), (SELECT id FROM classes WHERE class_code='7A')),
((SELECT id FROM students WHERE first_name='Zainab'), (SELECT id FROM classes WHERE class_code='7A')),
((SELECT id FROM students WHERE first_name='Layla'), (SELECT id FROM classes WHERE class_code='7A')),
((SELECT id FROM students WHERE first_name='Oliver'), (SELECT id FROM classes WHERE class_code='7B')),
((SELECT id FROM students WHERE first_name='Charlotte'), (SELECT id FROM classes WHERE class_code='7B')),
((SELECT id FROM students WHERE first_name='Sophie'), (SELECT id FROM classes WHERE class_code='7B')),
((SELECT id FROM students WHERE first_name='Nia'), (SELECT id FROM classes WHERE class_code='8A')),
((SELECT id FROM students WHERE first_name='Aryan'), (SELECT id FROM classes WHERE class_code='8A')),
((SELECT id FROM students WHERE first_name='Jack'), (SELECT id FROM classes WHERE class_code='8A')),
((SELECT id FROM students WHERE first_name='Sara'), (SELECT id FROM classes WHERE class_code='8B')),
((SELECT id FROM students WHERE first_name='Ethan'), (SELECT id FROM classes WHERE class_code='8B')),
((SELECT id FROM students WHERE first_name='Chloe'), (SELECT id FROM classes WHERE class_code='8B')),
((SELECT id FROM students WHERE first_name='Ibrahim'), (SELECT id FROM classes WHERE class_code='9A')),
((SELECT id FROM students WHERE first_name='Maryam'), (SELECT id FROM classes WHERE class_code='9A')),
((SELECT id FROM students WHERE first_name='Filip'), (SELECT id FROM classes WHERE class_code='9A')),
((SELECT id FROM students WHERE first_name='Ryan'), (SELECT id FROM classes WHERE class_code='10A')),
((SELECT id FROM students WHERE first_name='Yusuf'), (SELECT id FROM classes WHERE class_code='10A')),
((SELECT id FROM students WHERE first_name='Daniel' AND surname='Price'), (SELECT id FROM classes WHERE class_code='10A')),
((SELECT id FROM students WHERE first_name='Kiran'), (SELECT id FROM classes WHERE class_code='11A')),
((SELECT id FROM students WHERE first_name='Isabelle'), (SELECT id FROM classes WHERE class_code='11A')),
((SELECT id FROM students WHERE first_name='Simran'), (SELECT id FROM classes WHERE class_code='11A')),
((SELECT id FROM students WHERE first_name='Lily'), (SELECT id FROM classes WHERE class_code='5Y')),
((SELECT id FROM students WHERE first_name='Grace' AND surname='Osei-Mensah'), (SELECT id FROM classes WHERE class_code='5Y')),
((SELECT id FROM students WHERE first_name='Daniel' AND surname='Osei-Mensah'), (SELECT id FROM classes WHERE class_code='6Y')),
((SELECT id FROM students WHERE first_name='Ali'), (SELECT id FROM classes WHERE class_code='6Y'));

-- ============================
-- TASKS
-- ============================

INSERT INTO tasks (class_id, title, description, due_date)
VALUES
((SELECT id FROM classes WHERE class_code='7A'), 'English: Poetry Analysis', 'Read "The Highwayman" and annotate for imagery and rhythm.', '2026-09-14'),
((SELECT id FROM classes WHERE class_code='7A'), 'Maths: Fractions Worksheet', 'Complete worksheet 4B on adding and subtracting fractions.', '2026-09-18'),
((SELECT id FROM classes WHERE class_code='7B'), 'Science: Plant Cells Diagram', 'Label a diagram of a plant cell and describe each part''s function.', '2026-09-15'),
((SELECT id FROM classes WHERE class_code='7B'), 'History: Romans in Britain', 'Write one page on why the Romans invaded Britain.', '2026-09-21'),
((SELECT id FROM classes WHERE class_code='8A'), 'Geography: Rivers Case Study', 'Research the River Severn and prepare a short case study.', '2026-09-16'),
((SELECT id FROM classes WHERE class_code='8A'), 'Maths: Algebra Basics', 'Complete questions 1-20 on solving simple equations.', '2026-09-20'),
((SELECT id FROM classes WHERE class_code='8B'), 'English: Book Review', 'Write a review of the class reader, "Holes" by Louis Sachar.', '2026-09-17'),
((SELECT id FROM classes WHERE class_code='8B'), 'Art: Sketchbook Homework', 'Complete three observational sketches of household objects.', '2026-09-23'),
((SELECT id FROM classes WHERE class_code='9A'), 'Science: Chemical Reactions', 'Complete the lab report for the displacement reaction experiment.', '2026-09-19'),
((SELECT id FROM classes WHERE class_code='9A'), 'Maths: Trigonometry Practice', 'Complete SOHCAHTOA worksheet, questions 1-15.', '2026-09-25'),
((SELECT id FROM classes WHERE class_code='10A'), 'English Literature: An Inspector Calls', 'Answer the practice essay question on Mr Birling''s character.', '2026-09-22'),
((SELECT id FROM classes WHERE class_code='10A'), 'Science: GCSE Revision - Cell Biology', 'Complete revision workbook pages 10-14 on cell structure.', '2026-09-28'),
((SELECT id FROM classes WHERE class_code='11A'), 'Maths: GCSE Past Paper', 'Complete Edexcel Paper 1 (Non-Calculator), questions 1-12, under timed conditions.', '2026-09-24'),
((SELECT id FROM classes WHERE class_code='11A'), 'English: Personal Statement Draft', 'Bring a first draft of your college personal statement to class.', '2026-09-30'),
((SELECT id FROM classes WHERE class_code='5Y'), 'Reading Record', 'Read for 15 minutes each night and log it in your reading diary.', '2026-09-15'),
((SELECT id FROM classes WHERE class_code='6Y'), 'Maths: Times Tables Challenge', 'Practise the 6, 7 and 8 times tables ready for Friday''s quiz.', '2026-09-16');

-- ============================
-- ATTENDANCE
-- ============================

-- Year 7A, week of 13-17 July 2026
INSERT INTO attendance (class_id, student_id, date, status)
VALUES
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Adam' AND surname='Khan'), '2026-07-13', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Adam' AND surname='Khan'), '2026-07-14', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Adam' AND surname='Khan'), '2026-07-15', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Adam' AND surname='Khan'), '2026-07-16', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Adam' AND surname='Khan'), '2026-07-17', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Zainab'), '2026-07-13', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Zainab'), '2026-07-14', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Zainab'), '2026-07-15', 'ABSENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Zainab'), '2026-07-16', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Zainab'), '2026-07-17', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Layla'), '2026-07-13', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Layla'), '2026-07-14', 'ABSENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Layla'), '2026-07-15', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Layla'), '2026-07-16', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='7A'), (SELECT id FROM students WHERE first_name='Layla'), '2026-07-17', 'PRESENT');

-- Year 9A, same week
INSERT INTO attendance (class_id, student_id, date, status)
VALUES
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Ibrahim'), '2026-07-13', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Ibrahim'), '2026-07-14', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Ibrahim'), '2026-07-15', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Ibrahim'), '2026-07-16', 'ABSENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Ibrahim'), '2026-07-17', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Maryam'), '2026-07-13', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Maryam'), '2026-07-14', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Maryam'), '2026-07-15', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Maryam'), '2026-07-16', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Maryam'), '2026-07-17', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Filip'), '2026-07-13', 'ABSENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Filip'), '2026-07-14', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Filip'), '2026-07-15', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Filip'), '2026-07-16', 'PRESENT'),
((SELECT id FROM classes WHERE class_code='9A'), (SELECT id FROM students WHERE first_name='Filip'), '2026-07-17', 'PRESENT');

-- ============================
-- SCHOOL FEATURE FLAG OVERRIDES
-- ============================
-- Ilm School (established, larger) has attendance reporting and
-- notifications switched on; Greenwood Academy (newer, smaller) is still
-- on the platform defaults, to demonstrate the per-school override.

INSERT INTO school_feature_flags (school_id, feature_flag_id, enabled)
VALUES
((SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM feature_flags WHERE feature_key='attendance_report'), TRUE),
((SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM feature_flags WHERE feature_key='notifications'), TRUE),
((SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM feature_flags WHERE feature_key='student_notes'), TRUE);

-- ============================
-- STUDENT NOTES
-- ============================
-- Private, staff/parent-only notes entered from the attendance page.

INSERT INTO student_notes (student_id, author_user_id, note)
VALUES
((SELECT id FROM students WHERE first_name='Adam' AND surname='Khan'), (SELECT id FROM users WHERE username='teacher1'),
 'Adam has settled in well this term and is contributing more in class discussions.'),
((SELECT id FROM students WHERE first_name='Aryan'), (SELECT id FROM users WHERE username='e.clarke'),
 'Reminded Aryan to keep his inhaler in his bag during PE as well as the school office, in case he needs it quickly.'),
((SELECT id FROM students WHERE first_name='Maryam'), (SELECT id FROM users WHERE username='r.nguyen'),
 'Checked in with Maryam after lunch — blood sugar levels were fine, no concerns today.');

-- ============================
-- INDEPENDENT HOMEWORK
-- ============================
-- Homework set for one specific student rather than the whole class.

INSERT INTO tasks (class_id, student_id, title, description, due_date)
VALUES
((SELECT id FROM classes WHERE class_code='7A'),
 (SELECT id FROM students WHERE first_name='Layla'),
 'Extra Reading: Chapter Summaries', 'Write a short summary of chapters 3 and 4 to catch up after last week''s absence.', '2026-09-19'),
((SELECT id FROM classes WHERE class_code='11A'),
 (SELECT id FROM students WHERE first_name='Kiran'),
 'Maths: 1-to-1 Revision Set', 'Extra trigonometry questions to reinforce this week''s catch-up session.', '2026-09-26');

-- ============================
-- NOTIFICATIONS
-- ============================

INSERT INTO notifications (id, school_id, sender_user_id, audience, title, message, created_at)
VALUES
(1, (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='admin1'), 'parent',
 'School Photo Day', 'School photo day is scheduled for next Monday. Please ensure students are in full uniform.', '2026-07-20 09:00:00'),
(2, (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='owner1'), 'staff',
 'INSET Day - Staff Training', 'Reminder: INSET day training session on curriculum updates, Friday 9am in the main hall.', '2026-08-05 14:30:00'),
(3, (SELECT id FROM schools WHERE school_code='ILM2026'), (SELECT id FROM users WHERE username='admin1'), 'parent',
 'Autumn Term Parents'' Evening', 'Parents'' evening will be held on Thursday 15th October, 4pm-7pm. Please book your slot via the school office.', '2026-08-14 16:00:00');

-- Photo Day (parent) — every Ilm parent, all read
INSERT INTO notification_recipients (notification_id, user_id, read_at)
SELECT 1, id, '2026-07-20 18:00:00'
FROM users
WHERE username IN (
  'parent1','laura.bennett','yusuf.mahmoud','rachel.thompson','kwame.osei','reema.patel',
  'grace.wallace','bilal.hussain','elena.novak','craig.douglas','farida.ahmed','michael.carter',
  'harpreet.singh','tom.lewis','karen.bailey','amanda.kelly','susan.price'
);

-- INSET Day (staff) — leadership + all teachers, a couple unread
INSERT INTO notification_recipients (notification_id, user_id, read_at)
SELECT 2, id, '2026-08-05 15:00:00'
FROM users
WHERE username IN ('owner1','admin1','maintainer1','teacher1','e.clarke');

INSERT INTO notification_recipients (notification_id, user_id, read_at)
SELECT 2, id, NULL
FROM users
WHERE username IN ('r.nguyen','a.rahman','m.sullivan');

-- Parents' Evening (parent) — most recent, mostly unread
INSERT INTO notification_recipients (notification_id, user_id, read_at)
SELECT 3, id, '2026-08-14 19:20:00'
FROM users
WHERE username IN ('parent1','laura.bennett');

INSERT INTO notification_recipients (notification_id, user_id, read_at)
SELECT 3, id, NULL
FROM users
WHERE username IN (
  'yusuf.mahmoud','rachel.thompson','kwame.osei','reema.patel','grace.wallace','bilal.hussain',
  'elena.novak','craig.douglas','farida.ahmed','michael.carter','harpreet.singh','tom.lewis',
  'karen.bailey','amanda.kelly','susan.price'
);

-- ============================
-- PENDING REGISTRATIONS (DEMO)
-- ============================
-- Realistic in-flight registrations awaiting owner/admin approval, exactly
-- as the real register-parent / register-staff endpoints would leave them:
-- role is 'pending', requested_role records what they applied for, and
-- (for parents) their children are already linked to the class they asked
-- to join.

INSERT INTO users (username, email, password_hash, role_id, school_id, requested_role)
VALUES
('nicole.adeyemi', 'nicole.adeyemi@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='pending'), (SELECT id FROM schools WHERE school_code='ILM2026'), 'parent'),
('samuel.ojo', 'samuel.ojo@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='pending'), (SELECT id FROM schools WHERE school_code='ILM2026'), 'staff'),
('naomi.fletcher', 'naomi.fletcher@example.com', '$2a$10$HdcMkFwYY5bPIOGHZ4atAux5XlH.c5Vmx4tG21lUhHYpm0853rM0S', (SELECT id FROM roles WHERE name='pending'), (SELECT id FROM schools WHERE school_code='GRN2026'), 'parent');

INSERT INTO parents (user_id, school_id, first_name, surname, relationship_to_student, date_of_birth, address1, city, postcode, contact_number, email)
VALUES
((SELECT id FROM users WHERE username='nicole.adeyemi'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Nicole', 'Adeyemi', 'mother', '1988-04-06', '11 Beaumont Leys Lane', 'Leicester', 'LE4 2BN', '07700900301', 'nicole.adeyemi@example.com'),
((SELECT id FROM users WHERE username='naomi.fletcher'), (SELECT id FROM schools WHERE school_code='GRN2026'),
 'Naomi', 'Fletcher', 'mother', '1990-10-02', '14 Ashby Road', 'Loughborough', 'LE11 3AA', '07700900303', 'naomi.fletcher@example.com');

INSERT INTO staff_details (user_id, school_id, first_name, surname, gender, address1, city, postcode, email, phone_number)
VALUES
((SELECT id FROM users WHERE username='samuel.ojo'), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Samuel', 'Ojo', 'Male', '26 St Saviours Road', 'Leicester', 'LE5 3HB', 'samuel.ojo@example.com', '07700900302');

INSERT INTO students (parent_id, school_id, first_name, surname, gender, date_of_birth, address1, city, postcode)
VALUES
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='nicole.adeyemi')), (SELECT id FROM schools WHERE school_code='ILM2026'),
 'Tobi', 'Adeyemi', 'male', '2013-04-02', '11 Beaumont Leys Lane', 'Leicester', 'LE4 2BN'),
((SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username='naomi.fletcher')), (SELECT id FROM schools WHERE school_code='GRN2026'),
 'Ella', 'Fletcher', 'female', '2016-03-19', '14 Ashby Road', 'Loughborough', 'LE11 3AA');

INSERT INTO student_classes (student_id, class_id)
VALUES
((SELECT id FROM students WHERE first_name='Tobi'), (SELECT id FROM classes WHERE class_code='8A')),
((SELECT id FROM students WHERE first_name='Ella'), (SELECT id FROM classes WHERE class_code='5Y'));
