import type { ReactNode } from 'react';
import { FieldLabel, fieldGroupStyle } from '../atoms/FormAtoms';
import { registerFormStyles as styles } from '../styles/registerFormStyles';

export function FormField({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={fieldGroupStyle}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

export function TwoColumn({
  left,
  right
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div style={styles.twoColumn}>
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}
