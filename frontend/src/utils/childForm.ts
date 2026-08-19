// Shared by the public registration page (Register.tsx, one or more students)
// and the logged-in parent's "Add a Child" form (ParentDashboard.tsx, one
// student) so the two flows can't drift out of sync with each other again.

export type ChildFormData = {
  first_name: string;
  middle_name: string;
  surname: string;
  gender: string;
  date_of_birth: string;
  address1: string;
  address2: string;
  address3: string;
  city: string;
  postcode: string;
  medical_condition: string;
  class_code: string;
};

export const emptyChildForm: ChildFormData = {
  first_name: "",
  middle_name: "",
  surname: "",
  gender: "",
  date_of_birth: "",
  address1: "",
  address2: "",
  address3: "",
  city: "",
  postcode: "",
  medical_condition: "",
  class_code: ""
};

type FieldRule = {
  required?: boolean;
  message?: string;
  validate?: (v: string) => true | string;
};

export const childValidationRules: Record<keyof ChildFormData, FieldRule> = {
  first_name: {
    required: true,
    message: "First name is required",
    validate: v => /^[A-Za-z\s'-]+$/.test(v) || "First name contains invalid characters"
  },
  middle_name: { required: false },
  surname: {
    required: true,
    message: "Surname is required",
    validate: v => /^[A-Za-z\s'-]+$/.test(v) || "Surname contains invalid characters"
  },
  gender: {
    required: true,
    message: "Gender is required",
    validate: v => ["Male", "Female"].includes(v) || "Gender must be Male or Female"
  },
  date_of_birth: {
    required: true,
    message: "Date of birth is required",
    validate: v => {
      const d = new Date(v);
      if (isNaN(d.getTime())) return "Invalid date";
      if (d > new Date()) return "Date of birth cannot be in the future";
      return true;
    }
  },
  address1: { required: true, message: "Address line 1 is required" },
  address2: { required: false },
  address3: { required: false },
  city: { required: true, message: "City is required" },
  postcode: {
    required: true,
    message: "Postcode is required",
    validate: v => v.length >= 5 || "Postcode must be at least 5 characters"
  },
  medical_condition: { required: false },
  class_code: { required: true, message: "Class code is required" }
};

export const validateChildForm = (child: ChildFormData): Record<string, string> => {
  const errors: Record<string, string> = {};

  for (const field in childValidationRules) {
    const rule = childValidationRules[field as keyof ChildFormData];
    const value = child[field as keyof ChildFormData];

    if (rule.required && !value?.trim()) {
      errors[field] = rule.message || "This field is required";
      continue;
    }

    if (rule.validate && value?.trim()) {
      const result = rule.validate(value.trim());
      if (result !== true) {
        errors[field] = result;
      }
    }
  }

  return errors;
};
