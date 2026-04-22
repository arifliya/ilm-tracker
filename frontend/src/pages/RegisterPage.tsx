import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { registerFormStyles as styles } from '../components/styles/registerFormStyles';
import {
  EmergencyContactsSection,
  GuardianDetailsSection,
  HealthDisabilitySection,
  LoginDetailsSection,
  MiscSection,
  StudentDetailsSection,
  type FieldUpdater,
  type RegisterFormData
} from '../components/organisms/register';
import { HomeHeader } from '../components/organisms/home';

export default function RegisterPage() {
  const [formData, setFormData] = useState<RegisterFormData>({
    firstName: '',
    middleName: '',
    surname: '',
    gender: '',
    dob: '',
    ethnicOrigin: '',
    placeOfBirth: '',
    country: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    city: '',
    postCode: '',
    sameEmergencyAsParents: false,
    guardianRelationship: '',
    guardianFullName: '',
    guardianAddress: '',
    guardianContact: '',
    primaryEmergencyName: '',
    primaryEmergencyContact: '',
    secondaryEmergencyName: '',
    secondaryEmergencyContact: '',
    hasDisability: 'no',
    disabilityDetails: '',
    hasMedicalConditions: 'no',
    medicalConditionDetails: '',
    takesMedication: 'no',
    medicationDetails: '',
    previousMadrasahDetails: '',
    email: '',
    password: ''
  });
  const [message, setMessage] = useState('');

  const onFieldChange: FieldUpdater = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const fullName = useMemo(() => {
    return [formData.firstName, formData.middleName, formData.surname]
      .filter(Boolean)
      .join(' ')
      .trim();
  }, [formData.firstName, formData.middleName, formData.surname]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');

    try {
      const res = await api.post('/auth/register', {
        fullName,
        dob: formData.dob,
        email: formData.email,
        password: formData.password
      });
      setMessage(res.data.message);
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Registration failed');
    }
  };

  return (
    <div style={styles.screen}>
      <HomeHeader />
      <div style={styles.content}>
        <div style={styles.container}>
          <h2 style={styles.title}>Student Registration</h2>
          <p style={styles.subtitle}>
            Complete the enrollment form to create a new student portal account.
          </p>
          {message && <p style={styles.message}>{message}</p>}

          <form onSubmit={handleSubmit} style={styles.form}>
            <StudentDetailsSection data={formData} onFieldChange={onFieldChange} />
            <GuardianDetailsSection data={formData} onFieldChange={onFieldChange} />
            <EmergencyContactsSection data={formData} onFieldChange={onFieldChange} />
            <HealthDisabilitySection data={formData} onFieldChange={onFieldChange} />
            <MiscSection data={formData} onFieldChange={onFieldChange} />
            <LoginDetailsSection data={formData} onFieldChange={onFieldChange} />
          </form>

          <div style={styles.helperLinks}>
            <Link to="/" style={styles.helperLink}>
              Back to Home
            </Link>
            <Link to="/login" style={styles.helperLink}>
              Already have an account? Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
