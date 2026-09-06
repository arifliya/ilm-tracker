import { useState } from "react";
import { api } from "../api";
import { getErrorMessage } from "../utils/getErrorMessage";

// Shared between AdminDashboard, OwnerDashboard, and SystemAdminDashboard —
// these eight functions (create/edit/delete a class, assign/remove a
// student or teacher) were duplicated near-identically across all three,
// byte-for-byte for everything except createClass. The one real
// difference was SystemAdminDashboard's createClass sending a school_id,
// since system_admin isn't scoped to one school — kept here rather than
// special-cased, since Admin/Owner simply never populate
// newClassSchoolId, and `school_id: undefined` is dropped by JSON
// serialization the same as omitting the key outright.
//
// `reload` is deliberately the caller's own data-loading function, not
// something this hook owns — each dashboard's loadAll hits a different
// set of endpoints beyond classes/teachers/students, so there's no single
// shared implementation to call here.
// Deliberately just the fields this hook and the shared edit-form JSX
// actually touch — each dashboard's own class-list item has more fields
// (e.g. SystemAdminDashboard's school_code/school_name), and setEditingClass
// is always called with `{...c, ...}` from that wider shape.
export interface EditableClass {
  id: number;
  class_name: string;
  class_code?: string | null;
  year_group?: string | null;
  description?: string | null;
}

export interface UseClassManagementOptions {
  reload: () => void | Promise<void>;
  setLoadError: (message: string | null) => void;
  setSuccessMessage: (message: string | null) => void;
  // From each dashboard's own useConfirm() — not called again in here, since
  // that would mount a second, disconnected confirm dialog rather than
  // reusing the one each dashboard already renders.
  confirm: (message: string) => Promise<boolean>;
}

export const useClassManagement = ({ reload, setLoadError, setSuccessMessage, confirm }: UseClassManagementOptions) => {
  const [newClassSchoolId, setNewClassSchoolId] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [newClassYearGroup, setNewClassYearGroup] = useState("");
  const [newClassDescription, setNewClassDescription] = useState("");

  const [editingClass, setEditingClass] = useState<EditableClass | null>(null);

  const [assignStudentClassId, setAssignStudentClassId] = useState("");
  const [assignStudentId, setAssignStudentId] = useState("");

  const [assignClassId, setAssignClassId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.post("/admin/classes", {
        school_id: newClassSchoolId ? Number(newClassSchoolId) : undefined,
        class_name: newClassName,
        class_code: newClassCode,
        year_group: newClassYearGroup,
        description: newClassDescription
      });

      setNewClassSchoolId("");
      setNewClassName("");
      setNewClassCode("");
      setNewClassYearGroup("");
      setNewClassDescription("");
      reload();
      setSuccessMessage("Class created successfully.");
    } catch (err) {
      console.error("Create class error:", err);
      setLoadError(getErrorMessage(err, "Failed to create class"));
    }
  };

  const saveClassChanges = async () => {
    if (!editingClass) return;

    try {
      await api.put(`/admin/classes/${editingClass.id}`, {
        class_name: editingClass.class_name,
        class_code: editingClass.class_code,
        year_group: editingClass.year_group,
        description: editingClass.description
      });

      setEditingClass(null);
      reload();
      setSuccessMessage("Class updated successfully.");
    } catch (err) {
      console.error("Update class error:", err);
      setLoadError(getErrorMessage(err, "Failed to update class"));
    }
  };

  const assignStudentToClass = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!assignStudentClassId || !assignStudentId) {
      setLoadError("Please select both a class and a student.");
      return;
    }

    try {
      await api.post(`/admin/classes/${assignStudentClassId}/assign-student`, {
        studentId: Number(assignStudentId)
      });

      setAssignStudentClassId("");
      setAssignStudentId("");
      reload();
      setSuccessMessage("Student assigned to class successfully.");
    } catch (err) {
      console.error("Assign student error:", err);
      setLoadError(getErrorMessage(err, "Failed to assign student"));
    }
  };

  const assignTeacher = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!assignClassId || !assignTeacherId) {
      setLoadError("Please select both a class and a teacher.");
      return;
    }

    try {
      await api.post(`/admin/classes/${assignClassId}/assign-teacher`, {
        teacherUserId: Number(assignTeacherId)
      });

      reload();
      setAssignClassId("");
      setAssignTeacherId("");
      setSuccessMessage("Teacher assigned to class successfully.");
    } catch (err) {
      console.error("Assign teacher error:", err);
      setLoadError(getErrorMessage(err, "Failed to assign teacher"));
    }
  };

  const handleDeleteClass = async (classId: number) => {
    if (!(await confirm("Are you sure you want to remove this class?"))) return;

    try {
      await api.delete(`/admin/classes/${classId}`);
      reload();
      setSuccessMessage("Class deleted successfully.");
    } catch (err) {
      console.error("Delete class error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete class"));
    }
  };

  const removeStudentFromClass = async (classId: number, studentId: number) => {
    if (!(await confirm("Remove this student from the class?"))) return;

    try {
      await api.post(`/admin/classes/${classId}/remove-student`, {
        studentId
      });

      reload();
      setSuccessMessage("Student removed from class successfully.");
    } catch (err) {
      console.error("Remove student error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove student"));
    }
  };

  const handleRemoveTeacher = async (classId: number, teacherId: number) => {
    if (!(await confirm("Remove this teacher from the class?"))) return;

    try {
      await api.post(`/admin/classes/${classId}/remove-teacher`, {
        teacherUserId: teacherId
      });

      reload();
      setSuccessMessage("Teacher removed from class successfully.");
    } catch (err) {
      console.error("Remove teacher error:", err);
      setLoadError(getErrorMessage(err, "Failed to remove teacher"));
    }
  };

  const handleDeleteTeacher = async (teacherId: number) => {
    if (!(await confirm("Remove this teacher?"))) return;

    try {
      await api.delete(`/admin/teachers/${teacherId}`);
      reload();
      setSuccessMessage("Teacher removed successfully.");
    } catch (err) {
      console.error("Delete teacher error:", err);
      setLoadError(getErrorMessage(err, "Failed to delete teacher"));
    }
  };

  return {
    newClassSchoolId,
    setNewClassSchoolId,
    newClassName,
    setNewClassName,
    newClassCode,
    setNewClassCode,
    newClassYearGroup,
    setNewClassYearGroup,
    newClassDescription,
    setNewClassDescription,
    editingClass,
    setEditingClass,
    assignStudentClassId,
    setAssignStudentClassId,
    assignStudentId,
    setAssignStudentId,
    assignClassId,
    setAssignClassId,
    assignTeacherId,
    setAssignTeacherId,
    createClass,
    saveClassChanges,
    assignStudentToClass,
    assignTeacher,
    handleDeleteClass,
    removeStudentFromClass,
    handleRemoveTeacher,
    handleDeleteTeacher
  };
};
