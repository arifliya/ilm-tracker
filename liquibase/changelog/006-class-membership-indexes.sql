--liquibase formatted sql

--changeset ibrahim:006-class-membership-indexes
--comment: Reverse indexes for teacher_classes/student_classes. Both tables only index (teacher_id/student_id, class_id) via their composite PK, so any query filtering by class_id alone — class deletion cascade cleanup, fee-generation membership checks, roster joins in student/teacher/notes/reportCards/parent routes — sequential-scans the whole table. student_guardians already got the equivalent fix (idx_student_guardians_parent) for the same reason; this closes the same gap on these two.

CREATE INDEX idx_teacher_classes_class ON teacher_classes (class_id);
CREATE INDEX idx_student_classes_class ON student_classes (class_id);

--rollback DROP INDEX idx_student_classes_class;
--rollback DROP INDEX idx_teacher_classes_class;
