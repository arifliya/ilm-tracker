import type { CSSProperties } from 'react';

type StyleMap = Record<string, CSSProperties>;

export const registerFormStyles: StyleMap = {
  screen: {
    backgroundColor: '#f5f7fb',
    minHeight: '100vh',
    padding: 24
  },
  container: {
    maxWidth: 900,
    margin: '0 auto',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)'
  },
  title: {
    marginTop: 0,
    marginBottom: 16,
    fontSize: 28,
    fontWeight: 700,
    color: '#0f172a'
  },
  message: {
    marginBottom: 16,
    color: '#14532d',
    backgroundColor: '#dcfce7',
    borderRadius: 10,
    padding: 12
  },
  errorMessage: {
    marginBottom: 16,
    color: '#991b1b',
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 12
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  sectionTitle: {
    marginTop: 20,
    marginBottom: 4,
    fontSize: 18,
    fontWeight: 700,
    color: '#1e293b'
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: '#334155'
  },
  input: {
    height: 44,
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 15,
    backgroundColor: '#ffffff'
  },
  textArea: {
    minHeight: 90,
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    padding: 12,
    fontSize: 15,
    backgroundColor: '#ffffff'
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 4
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#334155'
  },
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12
  },
  button: {
    marginTop: 14,
    height: 46,
    borderRadius: 10,
    border: 'none',
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer'
  }
};
