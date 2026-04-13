import { PrimaryButton, SectionTitle, TextInput } from '../../atoms/FormAtoms';
import { FormField } from '../../molecules/FormMolecules';
import type { FieldUpdater, RegisterFormData } from './registerTypes';

type Props = {
  data: RegisterFormData;
  onFieldChange: FieldUpdater;
};

export function LoginDetailsSection({ data, onFieldChange }: Props) {
  return (
    <>
      <SectionTitle>Login Details</SectionTitle>
      <FormField label="Email">
        <TextInput value={data.email} onChange={value => onFieldChange('email', value)} />
      </FormField>
      <FormField label="Password">
        <TextInput type="password" value={data.password} onChange={value => onFieldChange('password', value)} />
      </FormField>
      <PrimaryButton>Register</PrimaryButton>
    </>
  );
}
