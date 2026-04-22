import type { CSSProperties } from 'react';
import { designTokens as t } from './designTokens';

type StyleMap = Record<string, CSSProperties>;

export const registerFormStyles: StyleMap = {
  screen: {
    backgroundColor: t.colors.pageBg,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column'
  },
  content: {
    width: '100%',
    maxWidth: 1120,
    margin: '0 auto',
    padding: `${t.spacing.lg}px ${t.spacing.md}px ${t.spacing.xl}px`
  },
  container: {
    maxWidth: 920,
    margin: '0 auto',
    backgroundColor: t.colors.surface,
    borderRadius: 16,
    border: `1px solid ${t.colors.borderSoft}`,
    padding: 24,
    boxShadow: '0 8px 24px rgba(24, 40, 30, 0.08)'
  },
  title: {
    marginTop: 0,
    marginBottom: 8,
    fontSize: 30,
    fontWeight: 700,
    color: t.colors.brand,
    fontFamily: 'Georgia, "Times New Roman", serif'
  },
  subtitle: {
    marginTop: 0,
    marginBottom: 16,
    color: t.colors.textMuted,
    lineHeight: 1.45
  },
  message: {
    marginBottom: 16,
    color: '#1b5a3f',
    backgroundColor: '#dff2e7',
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
    color: t.colors.brand
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: '#30413a'
  },
  input: {
    height: 44,
    borderRadius: 10,
    border: `1px solid ${t.colors.borderSoft}`,
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 15,
    backgroundColor: '#ffffff',
    color: t.colors.textPrimary
  },
  textArea: {
    minHeight: 90,
    borderRadius: 10,
    border: `1px solid ${t.colors.borderSoft}`,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#ffffff',
    color: t.colors.textPrimary
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 4
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#30413a'
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
    backgroundColor: t.colors.ctaPrimary,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer'
  },
  helperLinks: {
    marginTop: 12,
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap'
  },
  helperLink: {
    color: t.colors.brand,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14
  }
};
