import type { CSSProperties } from 'react';
import { registerFormStyles as styles } from '../styles/registerFormStyles';

type InputProps = {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
};

type CheckboxProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function SectionTitle({ children }: { children: string }) {
  return <h3 style={styles.sectionTitle}>{children}</h3>;
}

export function FieldLabel({ children }: { children: string }) {
  return <label style={styles.label}>{children}</label>;
}

export function TextInput({ value, onChange, type = 'text', placeholder }: InputProps) {
  return (
    <input
      style={styles.input}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
    />
  );
}

export function TextAreaInput({ value, onChange }: InputProps) {
  return <textarea style={styles.textArea} value={value} onChange={e => onChange(e.target.value)} />;
}

export function SelectInput({ value, onChange, options }: SelectProps) {
  return (
    <select style={styles.input} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function PrimaryButton({ children }: { children: string }) {
  return (
    <button style={styles.button} type="submit">
      {children}
    </button>
  );
}

export function CheckboxField({ id, label, checked, onChange }: CheckboxProps) {
  return (
    <div style={styles.checkboxRow}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <label htmlFor={id} style={styles.checkboxLabel}>
        {label}
      </label>
    </div>
  );
}

export const fieldGroupStyle = styles.fieldGroup as CSSProperties;
