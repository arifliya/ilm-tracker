import { SectionTitle, TextInput } from '../../atoms/FormAtoms';
import { FormField, TwoColumn } from '../../molecules/FormMolecules';
import type { FieldUpdater, RegisterFormData } from './registerTypes';

type Props = {
  data: RegisterFormData;
  onFieldChange: FieldUpdater;
};

export function EmergencyContactsSection({ data, onFieldChange }: Props) {
  return (
    <>
      <SectionTitle>Emergency Contacts</SectionTitle>
      <TwoColumn
        left={
          <FormField label="Primary contact name">
            <TextInput value={data.primaryEmergencyName} onChange={value => onFieldChange('primaryEmergencyName', value)} />
          </FormField>
        }
        right={
          <FormField label="Primary contact details">
            <TextInput
              value={data.primaryEmergencyContact}
              onChange={value => onFieldChange('primaryEmergencyContact', value)}
            />
          </FormField>
        }
      />
      <TwoColumn
        left={
          <FormField label="Secondary contact name">
            <TextInput
              value={data.secondaryEmergencyName}
              onChange={value => onFieldChange('secondaryEmergencyName', value)}
            />
          </FormField>
        }
        right={
          <FormField label="Secondary contact details">
            <TextInput
              value={data.secondaryEmergencyContact}
              onChange={value => onFieldChange('secondaryEmergencyContact', value)}
            />
          </FormField>
        }
      />
    </>
  );
}
