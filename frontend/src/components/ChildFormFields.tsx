import React from "react";
import { publicStyles as styles } from "../styles/publicStyles";
import { ChildFormData } from "../utils/childForm";

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

interface ChildFormFieldsProps {
  value: ChildFormData;
  onChange: (field: keyof ChildFormData, value: string) => void;
  errors: Record<string, string>;
}

// One child/student's fields — shared by the public registration page
// (repeated per student) and a logged-in parent's "Add a Child" form
// (a single instance) so both flows stay in sync.
const ChildFormFields: React.FC<ChildFormFieldsProps> = ({ value, onChange, errors }) => (
  <>
    <div style={row}>
      <label style={labelLeft}>First name *</label>
      <input style={inputRight} value={value.first_name} onChange={e => onChange("first_name", e.target.value)} />
    </div>
    {errors.first_name && <p style={styles.errorText}>{errors.first_name}</p>}

    <div style={row}>
      <label style={labelLeft}>Middle name</label>
      <input style={inputRight} value={value.middle_name} onChange={e => onChange("middle_name", e.target.value)} />
    </div>

    <div style={row}>
      <label style={labelLeft}>Surname *</label>
      <input style={inputRight} value={value.surname} onChange={e => onChange("surname", e.target.value)} />
    </div>
    {errors.surname && <p style={styles.errorText}>{errors.surname}</p>}

    <div style={row}>
      <label style={labelLeft}>Gender *</label>
      <select
        style={{ ...inputRight, width: "105%" }}
        value={value.gender}
        onChange={e => onChange("gender", e.target.value)}
      >
        <option value="">Select gender</option>
        <option value="Male">Male</option>
        <option value="Female">Female</option>
      </select>
    </div>
    {errors.gender && <p style={styles.errorText}>{errors.gender}</p>}

    <div style={row}>
      <label style={labelLeft}>Class code *</label>
      <input
        style={inputRight}
        value={value.class_code}
        onChange={e => onChange("class_code", e.target.value)}
        placeholder="Provided by your school"
      />
    </div>
    {errors.class_code && <p style={styles.errorText}>{errors.class_code}</p>}

    <div style={row}>
      <label style={labelLeft}>Date of birth *</label>
      <input style={inputRight} type="date" value={value.date_of_birth} onChange={e => onChange("date_of_birth", e.target.value)} />
    </div>
    {errors.date_of_birth && <p style={styles.errorText}>{errors.date_of_birth}</p>}

    <div style={row}>
      <label style={labelLeft}>Address line 1 *</label>
      <input style={inputRight} value={value.address1} onChange={e => onChange("address1", e.target.value)} />
    </div>
    {errors.address1 && <p style={styles.errorText}>{errors.address1}</p>}

    <div style={row}>
      <label style={labelLeft}>Address line 2</label>
      <input style={inputRight} value={value.address2} onChange={e => onChange("address2", e.target.value)} />
    </div>

    <div style={row}>
      <label style={labelLeft}>Address line 3</label>
      <input style={inputRight} value={value.address3} onChange={e => onChange("address3", e.target.value)} />
    </div>

    <div style={row}>
      <label style={labelLeft}>City *</label>
      <input style={inputRight} value={value.city} onChange={e => onChange("city", e.target.value)} />
    </div>
    {errors.city && <p style={styles.errorText}>{errors.city}</p>}

    <div style={row}>
      <label style={labelLeft}>Postcode *</label>
      <input style={inputRight} value={value.postcode} onChange={e => onChange("postcode", e.target.value)} />
    </div>
    {errors.postcode && <p style={styles.errorText}>{errors.postcode}</p>}

    <div style={row}>
      <label style={labelLeft}>Medical condition</label>
      <input
        style={inputRight}
        value={value.medical_condition}
        onChange={e => onChange("medical_condition", e.target.value)}
      />
    </div>
  </>
);

export default ChildFormFields;
