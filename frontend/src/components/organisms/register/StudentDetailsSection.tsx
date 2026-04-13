import {
  CheckboxField,
  SectionTitle,
  SelectInput,
  TextInput
} from '../../atoms/FormAtoms';
import { FormField } from '../../molecules/FormMolecules';
import type { FieldUpdater, RegisterFormData } from './registerTypes';

type Props = {
  data: RegisterFormData;
  onFieldChange: FieldUpdater;
};

export function StudentDetailsSection({ data, onFieldChange }: Props) {
  return (
    <>
      <SectionTitle>Student Details</SectionTitle>
      <FormField label="First name">
        <TextInput value={data.firstName} onChange={value => onFieldChange('firstName', value)} />
      </FormField>
      <FormField label="Middle name">
        <TextInput value={data.middleName} onChange={value => onFieldChange('middleName', value)} />
      </FormField>
      <FormField label="Surname">
        <TextInput value={data.surname} onChange={value => onFieldChange('surname', value)} />
      </FormField>
      <FormField label="Gender">
        <SelectInput
          value={data.gender}
          onChange={value => onFieldChange('gender', value)}
          options={[
            { value: '', label: 'Select gender' },
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
            { value: 'prefer_not_to_say', label: 'Prefer not to say' }
          ]}
        />
      </FormField>
      <FormField label="Date of birth">
        <TextInput type="date" value={data.dob} onChange={value => onFieldChange('dob', value)} />
      </FormField>
      <FormField label="Ethnic origin">
        <TextInput value={data.ethnicOrigin} onChange={value => onFieldChange('ethnicOrigin', value)} />
      </FormField>
      <FormField label="Place of birth (City)">
        <TextInput value={data.placeOfBirth} onChange={value => onFieldChange('placeOfBirth', value)} />
      </FormField>
      <FormField label="Country">
        <TextInput value={data.country} onChange={value => onFieldChange('country', value)} />
      </FormField>
      <FormField label="Address line 1">
        <TextInput value={data.addressLine1} onChange={value => onFieldChange('addressLine1', value)} />
      </FormField>
      <FormField label="Address line 2">
        <TextInput value={data.addressLine2} onChange={value => onFieldChange('addressLine2', value)} />
      </FormField>
      <FormField label="Address line 3">
        <TextInput value={data.addressLine3} onChange={value => onFieldChange('addressLine3', value)} />
      </FormField>
      <FormField label="City">
        <TextInput value={data.city} onChange={value => onFieldChange('city', value)} />
      </FormField>
      <FormField label="Post code">
        <TextInput value={data.postCode} onChange={value => onFieldChange('postCode', value)} />
      </FormField>
      <CheckboxField
        id="sameEmergencyAsParents"
        label="Emergency details same as parents"
        checked={data.sameEmergencyAsParents}
        onChange={checked => onFieldChange('sameEmergencyAsParents', checked)}
      />
    </>
  );
}
