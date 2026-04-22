import { SectionTitle, TextAreaInput } from '../../atoms/FormAtoms';
import { FormField } from '../../molecules/FormMolecules';
import type { FieldUpdater, RegisterFormData } from './registerTypes';

type Props = {
  data: RegisterFormData;
  onFieldChange: FieldUpdater;
};

export function MiscSection({ data, onFieldChange }: Props) {
  return (
    <>
      <SectionTitle>Misc</SectionTitle>
      <FormField label="Previous institution details">
        <TextAreaInput
          value={data.previousMadrasahDetails}
          onChange={value => onFieldChange('previousMadrasahDetails', value)}
        />
      </FormField>
    </>
  );
}
