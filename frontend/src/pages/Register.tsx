import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { publicStyles as styles } from "../styles/publicStyles";
import { getErrorMessage } from "../utils/getErrorMessage";
import ChildFormFields from "../components/ChildFormFields";
import { ChildFormData, emptyChildForm, validateChildForm } from "../utils/childForm";
import { validatePassword } from "../utils/password";

type Tab = "parent" | "staff";

const Register: React.FC = () => {
  const row = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 12
};

const labelLeft = {
  ...styles.label,
  width: "180px",
  whiteSpace: "nowrap"
};

const inputRight = {
  ...styles.input,
  flex: 1
};

  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>("parent");
  const [error, setError] = useState("");
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const setFieldError = (field: string, message: string) => {
    setFieldErrors(prev => ({ ...prev, [field]: message }));
  };

  const clearFieldErrors = () => {
    setFieldErrors({});
    setStudentErrors(prev => prev.map(() => ({})));
  };
  const resetMessages = () => {
    setError("");
    clearFieldErrors();
  };

  // ---------------------- PARENT FORM STATE ----------------------
  const [parentSchoolCode, setParentSchoolCode] = useState("");
  const [parentFirstName, setParentFirstName] = useState("");
  const [parentMiddleName, setParentMiddleName] = useState("");
  const [parentSurname, setParentSurname] = useState("");
  const [parentRelationship, setParentRelationship] = useState("");
  const [parentDob, setParentDob] = useState("");
  const [parentAddress1, setParentAddress1] = useState("");
  const [parentAddress2, setParentAddress2] = useState("");
  const [parentAddress3, setParentAddress3] = useState("");
  const [parentCity, setParentCity] = useState("");
  const [parentPostcode, setParentPostcode] = useState("");
  const [parentMedical, setParentMedical] = useState("");
  const [parentContact, setParentContact] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPassword, setParentPassword] = useState("");

  const [students, setStudents] = useState<ChildFormData[]>([{ ...emptyChildForm }]);
  const [studentErrors, setStudentErrors] = useState<Record<string, string>[]>([{}]);

  const updateStudent = (index: number, field: keyof ChildFormData, value: string) => {
    setStudents(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addStudent = () => {
    setStudents(prev => [...prev, { ...emptyChildForm }]);
    setStudentErrors(prev => [...prev, {}]);
  };
  const removeStudent = (index: number) => {
    // Allowed to go to zero — a parent registering purely to link as an
    // additional guardian on an existing child (via guardianLinks below)
    // doesn't need to submit a new-child form at all.
    setStudents(prev => prev.filter((_, i) => i !== index));
    setStudentErrors(prev => prev.filter((_, i) => i !== index));
  };

  // ---------------------- GUARDIAN LINK STATE ----------------------
  // Deliberately separate from `students` — a guardian link entry is a
  // single existing-child code, not a full student record, so it doesn't
  // reuse ChildFormData/ChildFormFields.
  const [guardianLinks, setGuardianLinks] = useState<string[]>([]);

  const updateGuardianLink = (index: number, value: string) => {
    setGuardianLinks(prev => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };
  const addGuardianLink = () => setGuardianLinks(prev => [...prev, ""]);
  const removeGuardianLink = (index: number) => {
    setGuardianLinks(prev => prev.filter((_, i) => i !== index));
  };

  // ---------------------- STAFF FORM STATE ----------------------
  const [staffSchoolCode, setStaffSchoolCode] = useState("");
  const [staffFirstName, setStaffFirstName] = useState("");
  const [staffMiddleName, setStaffMiddleName] = useState("");
  const [staffSurname, setStaffSurname] = useState("");
  const [staffDob, setStaffDob] = useState("");
  const [staffGender, setStaffGender] = useState("");
  const [staffAddress1, setStaffAddress1] = useState("");
  const [staffAddress2, setStaffAddress2] = useState("");
  const [staffAddress3, setStaffAddress3] = useState("");
  const [staffCity, setStaffCity] = useState("");
  const [staffPostcode, setStaffPostcode] = useState("");
  const [staffMedical, setStaffMedical] = useState("");
  const [staffDisability, setStaffDisability] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

  // ---------------------- VALIDATION ----------------------

  const validateParent = () => {
    let valid = true;
    clearFieldErrors();

    if (!parentSchoolCode.trim()) {
      setFieldError("parentSchoolCode", "School code is required");
      valid = false;
    }
    if (!parentFirstName.trim()) {
      setFieldError("parentFirstName", "First name is required");
      valid = false;
    }
    if (!parentSurname.trim()) {
      setFieldError("parentSurname", "Surname is required");
      valid = false;
    }
    if (!parentRelationship.trim()) {
      setFieldError("parentRelationship", "Relationship is required");
      valid = false;
    }
    if (!parentEmail.trim()) {
      setFieldError("parentEmail", "Email is required");
      valid = false;
    }
    const parentPasswordError = validatePassword(parentPassword);
    if (parentPasswordError) {
      setFieldError("parentPassword", parentPasswordError);
      valid = false;
    }
    if (!parentContact.trim()) {
      setFieldError("parentContact", "Contact number is required");
      valid = false;
    }

    const nextStudentErrors = students.map(s => validateChildForm(s));
    setStudentErrors(nextStudentErrors);
    if (nextStudentErrors.some(errs => Object.keys(errs).length > 0)) {
      valid = false;
    }

    const trimmedGuardianLinks = guardianLinks.map(c => c.trim());
    if (students.length === 0 && trimmedGuardianLinks.filter(Boolean).length === 0) {
      setError("Add at least one student, or a guardian code for an existing child.");
      valid = false;
    }
    if (trimmedGuardianLinks.some(c => !c)) {
      setError("Each guardian code entry must not be empty — remove any blank ones.");
      valid = false;
    }

    return valid;
  };

const validateStaff = () => {
  let valid = true;
  clearFieldErrors();

  if (!staffSchoolCode.trim()) {
    setFieldError("staffSchoolCode", "School code is required");
    valid = false;
  }

  if (!staffFirstName.trim()) {
    setFieldError("staffFirstName", "First name is required");
    valid = false;
  }

  if (!staffSurname.trim()) {
    setFieldError("staffSurname", "Surname is required");
    valid = false;
  }

  // ⭐ NEW — Gender validation
  if (!staffGender || !staffGender.trim()) {
    setFieldError("staffGender", "Gender is required");
    valid = false;
  }

  if (!staffEmail.trim()) {
    setFieldError("staffEmail", "Email is required");
    valid = false;
  }

  const staffPasswordError = validatePassword(staffPassword);
  if (staffPasswordError) {
    setFieldError("staffPassword", staffPasswordError);
    valid = false;
  }

  if (!staffPhone.trim()) {
    setFieldError("staffPhone", "Phone number is required");
    valid = false;
  }

  return valid;
};

  // ---------------------- DUPLICATE CHECK ----------------------

  const checkDuplicate = async (email: string, address1: string, postcode: string) => {
    try {
      const res = await api.post("/auth/check-duplicate", {
        email,
        address1,
        postcode
      });

      return res.data; // { exists: boolean, reason?: string }
    } catch (err) {
      console.error("Duplicate check failed:", err);
      return { exists: false };
    }
  };
  // ---------------------- SUBMIT HANDLERS ----------------------

  const handleParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!validateParent()) return;

    // Duplicate check
    const dup = await checkDuplicate(parentEmail, parentAddress1, parentPostcode);

    if (dup.exists) {
      if (dup.reason === "email") setError("An account with this email already exists.");
      else if (dup.reason === "address") setError("A user with this address already exists.");
      else setError("This user already exists.");
      return;
    }

    try {
      await api.post("/auth/register-parent", {
        user_type: "parent",
        school_code: parentSchoolCode,
        parent: {
          first_name: parentFirstName,
          middle_name: parentMiddleName,
          surname: parentSurname,
          relationship_to_student: parentRelationship,
          date_of_birth: parentDob,
          address1: parentAddress1,
          address2: parentAddress2,
          address3: parentAddress3,
          city: parentCity,
          postcode: parentPostcode,
          medical_condition: parentMedical,
          contact_number: parentContact,
          email: parentEmail,
          password: parentPassword
        },
        students: students.map(s => ({
          first_name: s.first_name,
          middle_name: s.middle_name,
          surname: s.surname,
          gender: s.gender,
          date_of_birth: s.date_of_birth,
          address1: s.address1,
          address2: s.address2,
          address3: s.address3,
          city: s.city,
          postcode: s.postcode,
          medical_condition: s.medical_condition,
          class_code: s.class_code
        })),
        guardian_links: guardianLinks
          .map(c => c.trim())
          .filter(Boolean)
          .map(guardian_code => ({ guardian_code }))
      });

      setShowSuccessScreen(true);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "Failed to register parent. Please try again."));
    }
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!validateStaff()) return;

    // Duplicate check
    const dup = await checkDuplicate(staffEmail, staffAddress1, staffPostcode);

    if (dup.exists) {
      if (dup.reason === "email") setError("An account with this email already exists.");
      else if (dup.reason === "address") setError("A user with this address already exists.");
      else setError("This user already exists.");
      return;
    }

    try {
      await api.post("/auth/register-staff", {
        user_type: "staff",
        school_code: staffSchoolCode,
        first_name: staffFirstName,
        middle_name: staffMiddleName,
        surname: staffSurname,
        date_of_birth: staffDob,
        gender: staffGender,
        address1: staffAddress1,
        address2: staffAddress2,
        address3: staffAddress3,
        city: staffCity,
        postcode: staffPostcode,
        medical_condition: staffMedical,
        disability: staffDisability,
        email: staffEmail,
        phone_number: staffPhone,
        password: staffPassword
      });

      setShowSuccessScreen(true);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "Failed to register staff. Please try again."));
    }
  };

  // ---------------------- SUCCESS SCREEN ----------------------

  if (showSuccessScreen) {
    return (
      <div style={styles.pageCentered}>
        <div style={styles.card}>
          <h2 style={styles.title}>Registration Submitted</h2>
          <p style={styles.text}>
            Your account is now <strong>pending approval</strong> by an administrator.
          </p>

          <button style={styles.actionBtn} onClick={() => navigate("/login")}>
            Go to Login
          </button>

          <button style={styles.secondaryBtn} onClick={() => navigate("/")}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }
  // ---------------------- MAIN FORM ----------------------

  return (
    <div style={styles.pageCentered}>
      <div style={styles.card}>
        <h2 style={styles.title}>Register</h2>
        <p style={styles.text}>Choose your registration type.</p>

 <div
  style={{
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    width: "100%"
  }}
>
  <button
    type="button"
    style={{
      ...styles.actionBtn,
      transition: "all 0.25s ease",
      transform: activeTab === "parent" ? "scale(1.05)" : "scale(1)",
      background: activeTab === "parent" ? "#2563eb" : "#e5e7eb",
      color: activeTab === "parent" ? "#fff" : "#111"
    }}
    onClick={() => {
      resetMessages();
      setActiveTab("parent");
    }}
  >
    Parent
  </button>

  <button
    type="button"
    style={{
      ...styles.actionBtn,
      transition: "all 0.25s ease",
      transform: activeTab === "staff" ? "scale(1.05)" : "scale(1)",
      background: activeTab === "staff" ? "#2563eb" : "#e5e7eb",
      color: activeTab === "staff" ? "#fff" : "#111"
    }}
    onClick={() => {
      resetMessages();
      setActiveTab("staff");
    }}
  >
    Staff
  </button>
</div>


        {error && (
          <p style={{ ...styles.text, color: "red", marginTop: 8 }}>{error}</p>
        )}

{/* ---------------------- PARENT FORM ---------------------- */}
{activeTab === "parent" && (
  <form onSubmit={handleParentSubmit} style={styles.form}>
    <h3 style={styles.sectionTitle}>Parent details</h3>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>School code *</label>
      <input
        style={inputRight}
        value={parentSchoolCode}
        onChange={e => setParentSchoolCode(e.target.value)}
        placeholder="Provided by your school"
      />
    </div>
    {fieldErrors.parentSchoolCode && <p style={styles.errorText}>{fieldErrors.parentSchoolCode}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>First name *</label>
      <input style={inputRight} value={parentFirstName} onChange={e => setParentFirstName(e.target.value)} />
    </div>
    {fieldErrors.parentFirstName && <p style={styles.errorText}>{fieldErrors.parentFirstName}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Middle name</label>
      <input style={inputRight} value={parentMiddleName} onChange={e => setParentMiddleName(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Surname *</label>
      <input style={inputRight} value={parentSurname} onChange={e => setParentSurname(e.target.value)} />
    </div>
    {fieldErrors.parentSurname && <p style={styles.errorText}>{fieldErrors.parentSurname}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Relationship to student *</label>
      <select
        style={{ ...inputRight, width: "105%" }}
        value={parentRelationship}
        onChange={e => setParentRelationship(e.target.value)}
      >
        <option value="">Select relationship</option>
        <option value="Parent - Mother">Parent - Mother</option>
        <option value="Parent - Father">Parent - Father</option>
        <option value="Guardian">Guardian</option>
        <option value="Carer">Carer</option>
      </select>
    </div>
    {fieldErrors.parentRelationship && <p style={styles.errorText}>{fieldErrors.parentRelationship}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Date of birth</label>
      <input style={inputRight} type="date" value={parentDob} onChange={e => setParentDob(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Address line 1</label>
      <input style={inputRight} value={parentAddress1} onChange={e => setParentAddress1(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Address line 2</label>
      <input style={inputRight} value={parentAddress2} onChange={e => setParentAddress2(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Address line 3</label>
      <input style={inputRight} value={parentAddress3} onChange={e => setParentAddress3(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>City</label>
      <input style={inputRight} value={parentCity} onChange={e => setParentCity(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Postcode</label>
      <input style={inputRight} value={parentPostcode} onChange={e => setParentPostcode(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Medical condition</label>
      <input style={inputRight} value={parentMedical} onChange={e => setParentMedical(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Contact number *</label>
      <input type="tel" style={inputRight} value={parentContact} onChange={e => setParentContact(e.target.value)} />
    </div>
    {fieldErrors.parentContact && <p style={styles.errorText}>{fieldErrors.parentContact}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Email *</label>
      <input style={inputRight} type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} />
    </div>
    {fieldErrors.parentEmail && <p style={styles.errorText}>{fieldErrors.parentEmail}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Password *</label>
      <input style={inputRight} type="password" value={parentPassword} onChange={e => setParentPassword(e.target.value)} />
    </div>
    {fieldErrors.parentPassword && <p style={styles.errorText}>{fieldErrors.parentPassword}</p>}

    {/* ---------------------- STUDENT SECTION ---------------------- */}
    <h3 style={styles.sectionTitle}>Student(s) details</h3>

    {students.map((s, idx) => (
      <div key={idx} style={{ padding: 12, marginBottom: 12, borderRadius: 8 }}>
        <p style={{ ...styles.text, marginBottom: 8 }}>Student {idx + 1}</p>

        <ChildFormFields
          value={s}
          onChange={(field, value) => updateStudent(idx, field, value)}
          errors={studentErrors[idx] || {}}
        />

        <button type="button" style={styles.secondaryBtn} onClick={() => removeStudent(idx)}>
          Remove this student
        </button>
      </div>
    ))}

    <button type="button" style={styles.secondaryBtn} onClick={addStudent}>
      Add another student
    </button>

    {/* ---------------------- GUARDIAN LINK SECTION ---------------------- */}
    <h3 style={styles.sectionTitle}>Link to a child already registered</h3>
    <p style={{ ...styles.text, marginBottom: 8 }}>
      If a child is already registered under another guardian (e.g. a separated parent), enter their
      guardian code here instead of registering them again. This requires admin approval.
    </p>

    {guardianLinks.map((code, idx) => (
      <div key={idx} className="form-row" style={row}>
        <label className="form-row-label" style={labelLeft}>Guardian code</label>
        <input
          style={inputRight}
          value={code}
          onChange={e => updateGuardianLink(idx, e.target.value)}
          placeholder="Provided by the child's other guardian"
        />
        <button type="button" style={styles.secondaryBtn} onClick={() => removeGuardianLink(idx)}>
          Remove
        </button>
      </div>
    ))}

    <button type="button" style={styles.secondaryBtn} onClick={addGuardianLink}>
      Add a guardian code
    </button>

    <button type="submit" style={styles.actionBtn}>
      Submit parent registration
    </button>
  </form>
)}


{/* ---------------------- STAFF FORM ---------------------- */}
{activeTab === "staff" && (
  <form onSubmit={handleStaffSubmit} style={styles.form}>
    <h3 style={styles.sectionTitle}>Staff details</h3>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>School code *</label>
      <input
        style={inputRight}
        value={staffSchoolCode}
        onChange={e => setStaffSchoolCode(e.target.value)}
        placeholder="Provided by your school"
      />
    </div>
    {fieldErrors.staffSchoolCode && <p style={styles.errorText}>{fieldErrors.staffSchoolCode}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>First name *</label>
      <input style={inputRight} value={staffFirstName} onChange={e => setStaffFirstName(e.target.value)} />
    </div>
    {fieldErrors.staffFirstName && <p style={styles.errorText}>{fieldErrors.staffFirstName}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Middle name</label>
      <input style={inputRight} value={staffMiddleName} onChange={e => setStaffMiddleName(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Surname *</label>
      <input style={inputRight} value={staffSurname} onChange={e => setStaffSurname(e.target.value)} />
    </div>
    {fieldErrors.staffSurname && <p style={styles.errorText}>{fieldErrors.staffSurname}</p>}

    {/* ⭐ NEW FIELD — GENDER */}
    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Gender *</label>
      <select
        style={{ ...inputRight, width: "105%" }}
        value={staffGender}
        onChange={e => setStaffGender(e.target.value)}
      >
        <option value="">Select gender</option>
        <option value="Male">Male</option>
        <option value="Female">Female</option>
      </select>
    </div>
    {fieldErrors.staffGender && <p style={styles.errorText}>{fieldErrors.staffGender}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Date of birth</label>
      <input style={inputRight} type="date" value={staffDob} onChange={e => setStaffDob(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Address line 1</label>
      <input style={inputRight} value={staffAddress1} onChange={e => setStaffAddress1(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Address line 2</label>
      <input style={inputRight} value={staffAddress2} onChange={e => setStaffAddress2(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Address line 3</label>
      <input style={inputRight} value={staffAddress3} onChange={e => setStaffAddress3(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>City</label>
      <input style={inputRight} value={staffCity} onChange={e => setStaffCity(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Postcode</label>
      <input style={inputRight} value={staffPostcode} onChange={e => setStaffPostcode(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Medical condition</label>
      <input style={inputRight} value={staffMedical} onChange={e => setStaffMedical(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Disability</label>
      <input style={inputRight} value={staffDisability} onChange={e => setStaffDisability(e.target.value)} />
    </div>

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Email *</label>
      <input style={inputRight} type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} />
    </div>
    {fieldErrors.staffEmail && <p style={styles.errorText}>{fieldErrors.staffEmail}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Phone number *</label>
      <input type="tel" style={inputRight} value={staffPhone} onChange={e => setStaffPhone(e.target.value)} />
    </div>
    {fieldErrors.staffPhone && <p style={styles.errorText}>{fieldErrors.staffPhone}</p>}

    <div className="form-row" style={row}>
      <label className="form-row-label" style={labelLeft}>Password *</label>
      <input style={inputRight} type="password" value={staffPassword} onChange={e => setStaffPassword(e.target.value)} />
    </div>
    {fieldErrors.staffPassword && <p style={styles.errorText}>{fieldErrors.staffPassword}</p>}

    <button type="submit" style={styles.actionBtn}>
      Submit staff registration
    </button>
  </form>
)}


        {/* ---------------------- FOOTER LINKS ---------------------- */}
        <p style={{ ...styles.text, marginTop: 16 }}>
          Already registered?{" "}
          <span
            style={{ color: "#2563eb", cursor: "pointer", fontWeight: 600 }}
            onClick={() => navigate("/login")}
          >
            Login
          </span>
        </p>

        <p
          style={{
            ...styles.text,
            marginTop: 8,
            cursor: "pointer",
            color: "#2563eb",
            fontWeight: 600
          }}
          onClick={() => navigate("/")}
        >
          Back to Home
        </p>
      </div>
    </div>
  );
};

export default Register;
