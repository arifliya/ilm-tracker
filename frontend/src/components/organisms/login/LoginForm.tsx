import { PrimaryButton, SectionTitle, TextInput } from '../../atoms/FormAtoms';
import { FormField } from '../../molecules/FormMolecules';

type Props = {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
};

export function LoginForm({
  email,
  password,
  onEmailChange,
  onPasswordChange
}: Props) {
  return (
    <>
      <SectionTitle>Login Details</SectionTitle>
      <FormField label="Email">
        <TextInput value={email} onChange={onEmailChange} />
      </FormField>
      <FormField label="Password">
        <TextInput type="password" value={password} onChange={onPasswordChange} />
      </FormField>
      <PrimaryButton>Login</PrimaryButton>
    </>
  );
}
