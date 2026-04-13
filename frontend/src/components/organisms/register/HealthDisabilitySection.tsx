import {
  SectionTitle,
  SelectInput,
  TextAreaInput
} from '../../atoms/FormAtoms';
import { FormField } from '../../molecules/FormMolecules';
import type { FieldUpdater, RegisterFormData } from './registerTypes';

type Props = {
  data: RegisterFormData;
  onFieldChange: FieldUpdater;
};

export function HealthDisabilitySection({ data, onFieldChange }: Props) {
  return (
    <>
      <SectionTitle>Health & Disability</SectionTitle>

      <FormField label="Any disabilities?">
        <SelectInput
          value={data.hasDisability}
          onChange={value => onFieldChange('hasDisability', value)}
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' }
          ]}
        />
      </FormField>
      {data.hasDisability === 'yes' && (
        <FormField label="Disability details">
          <TextAreaInput value={data.disabilityDetails} onChange={value => onFieldChange('disabilityDetails', value)} />
        </FormField>
      )}

      <FormField label="Any medical conditions?">
        <SelectInput
          value={data.hasMedicalConditions}
          onChange={value => onFieldChange('hasMedicalConditions', value)}
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' }
          ]}
        />
      </FormField>
      {data.hasMedicalConditions === 'yes' && (
        <FormField label="Medical condition details">
          <TextAreaInput
            value={data.medicalConditionDetails}
            onChange={value => onFieldChange('medicalConditionDetails', value)}
          />
        </FormField>
      )}

      <FormField label="Any medication?">
        <SelectInput
          value={data.takesMedication}
          onChange={value => onFieldChange('takesMedication', value)}
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' }
          ]}
        />
      </FormField>
      {data.takesMedication === 'yes' && (
        <FormField label="Medication details">
          <TextAreaInput value={data.medicationDetails} onChange={value => onFieldChange('medicationDetails', value)} />
        </FormField>
      )}
    </>
  );
}
