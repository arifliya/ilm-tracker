import type { CSSProperties } from 'react';
import { designTokens as t } from './designTokens';

type StyleMap = Record<string, CSSProperties>;

export const homePageStyles: StyleMap = {
  screen: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: t.colors.pageBg,
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: t.spacing.md,
    backgroundColor: t.colors.surface,
    borderBottom: `1px solid ${t.colors.borderSoft}`,
    padding: `${t.spacing.sm}px ${t.spacing.lg}px`
  },
  brandWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing.sm
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 999,
    display: 'grid',
    placeItems: 'center',
    backgroundColor: '#dcc690'
  },
  brandText: {
    margin: 0,
    color: t.colors.textPrimary,
    fontSize: 18,
    fontWeight: 700
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing.md,
    flexWrap: 'wrap'
  },
  navLink: {
    textDecoration: 'none',
    color: t.colors.textPrimary,
    fontSize: 14,
    fontWeight: 500
  },
  applyButton: {
    border: 'none',
    borderRadius: t.radius.sm,
    padding: '10px 14px',
    fontWeight: 700,
    color: '#ffffff',
    backgroundColor: t.colors.brandAccent
  },
  heroGrid: {
    display: 'block',
    borderBottom: `1px solid ${t.colors.borderSoft}`
  },
  heroMain: {
    minHeight: 360,
    padding: `${t.spacing.xl}px ${t.spacing.lg}px`,
    background:
      'linear-gradient(rgba(9, 31, 24, 0.35), rgba(9, 31, 24, 0.35)), linear-gradient(130deg, #6f8d71 0%, #8ea488 33%, #9cb58e 68%, #7f9a77 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroContent: {
    maxWidth: 820
  },
  kicker: {
    margin: 0,
    textTransform: 'uppercase',
    fontWeight: 700,
    letterSpacing: 0.6,
    color: '#2e4f3f',
    fontSize: 14
  },
  heroTitle: {
    margin: `${t.spacing.sm}px 0 0`,
    color: '#ffffff',
    fontSize: 64,
    lineHeight: 1.03,
    fontFamily: 'Georgia, "Times New Roman", serif'
  },
  heroBody: {
    margin: `${t.spacing.md}px 0 0`,
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 30,
    lineHeight: 1.5
  },
  buttonRow: {
    marginTop: t.spacing.lg,
    display: 'flex',
    gap: t.spacing.sm,
    flexWrap: 'wrap'
  },
  section: {
    padding: `${t.spacing.md}px ${t.spacing.lg}px`,
    backgroundColor: '#f4f4ec'
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: t.spacing.md
  },
  card: {
    border: `1px solid ${t.colors.borderSoft}`,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surface,
    boxShadow: t.shadow.card,
    padding: t.spacing.md
  },
  cardTitle: {
    margin: 0,
    color: t.colors.brand,
    fontSize: 20
  },
  cardBody: {
    margin: `${t.spacing.xs}px 0 0`,
    color: t.colors.textMuted,
    lineHeight: 1.45
  },
  impactSection: {
    marginTop: 'auto',
    background: `linear-gradient(110deg, ${t.colors.impactBgStart}, ${t.colors.impactBgEnd})`,
    padding: `${t.spacing.md}px ${t.spacing.lg}px ${t.spacing.lg}px`,
    color: '#ffffff'
  },
  impactTitle: {
    margin: 0,
    textAlign: 'center',
    fontSize: 36,
    fontFamily: 'Georgia, "Times New Roman", serif'
  },
  impactGrid: {
    marginTop: t.spacing.md,
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: t.spacing.sm
  },
  impactItem: {
    border: '1px solid rgba(255, 255, 255, 0.28)',
    borderRadius: t.radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: t.spacing.sm
  },
  impactValue: {
    display: 'block',
    fontSize: 28,
    fontWeight: 700
  },
  impactLabel: {
    display: 'block',
    marginTop: 2,
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14
  }
};

export const homeButtonStyles = {
  base: {
    border: 'none',
    borderRadius: t.radius.sm,
    padding: '12px 16px',
    color: '#ffffff',
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: 15,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  } as CSSProperties,
  primary: {
    backgroundColor: t.colors.ctaPrimary
  } as CSSProperties,
  secondary: {
    backgroundColor: t.colors.ctaSecondary
  } as CSSProperties
};
