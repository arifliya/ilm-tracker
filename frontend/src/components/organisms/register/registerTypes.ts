export type RegisterFormData = {
  firstName: string;
  middleName: string;
  surname: string;
  gender: string;
  dob: string;
  ethnicOrigin: string;
  placeOfBirth: string;
  country: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  city: string;
  postCode: string;
  sameEmergencyAsParents: boolean;
  guardianRelationship: string;
  guardianFullName: string;
  guardianAddress: string;
  guardianContact: string;
  primaryEmergencyName: string;
  primaryEmergencyContact: string;
  secondaryEmergencyName: string;
  secondaryEmergencyContact: string;
  hasDisability: string;
  disabilityDetails: string;
  hasMedicalConditions: string;
  medicalConditionDetails: string;
  takesMedication: string;
  medicationDetails: string;
  previousMadrasahDetails: string;
  email: string;
  password: string;
};

export type FieldUpdater = <K extends keyof RegisterFormData>(
  field: K,
  value: RegisterFormData[K]
) => void;
