import { SectionTitle, SelectInput, TextAreaInput, TextInput } from '../../atoms/FormAtoms';
import { FormField } from '../../molecules/FormMolecules';
import type { FieldUpdater, RegisterFormData } from './registerTypes';

type Props = {
  data: RegisterFormData;
  onFieldChange: FieldUpdater;
};

export function GuardianDetailsSection({ data, onFieldChange }: Props) {
  return (
    <>
      <SectionTitle>Parents / Guardian Details</SectionTitle>
      <FormField label="Relationship">
        <SelectInput
          value={data.guardianRelationship}
          onChange={value => onFieldChange('guardianRelationship', value)}
          options={[
            { value: '', label: 'Select relationship' },
            { value: 'mother', label: 'Mother' },
            { value: 'father', label: 'Father' },
            { value: 'guardian', label: 'Guardian' },
            { value: 'other', label: 'Other' }
          ]}
        />
      </FormField>
      <FormField label="Full name">
        <TextInput value={data.guardianFullName} onChange={value => onFieldChange('guardianFullName', value)} />
      </FormField>
      <FormField label="Address">
        <TextAreaInput value={data.guardianAddress} onChange={value => onFieldChange('guardianAddress', value)} />
      </FormField>
      <FormField label="Contact details (home/mobile/work/email)">
        <TextAreaInput value={data.guardianContact} onChange={value => onFieldChange('guardianContact', value)} />
      </FormField>
    </>
  );
}
