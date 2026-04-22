import type { CSSProperties } from 'react';
import { designTokens as t } from './designTokens';

type StyleMap = Record<string, CSSProperties>;

export const loggedInPageStyles: StyleMap = {
  page: {
    minHeight: '100vh',
    width: '100%',
    backgroundColor: t.colors.pageBg,
    padding: 0
  },
  shell: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: '#f7f3e7'
  },
  topBar: {
    backgroundColor: t.colors.brand,
    color: '#ffffff',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.sm
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing.sm
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing.md,
    flexWrap: 'wrap'
  },
  brand: {
    margin: 0,
    fontWeight: 700,
    fontSize: 14
  },
  topNav: {
    display: 'flex',
    gap: t.spacing.md,
    flexWrap: 'wrap'
  },
  topNavItem: {
    color: 'rgba(255, 255, 255, 0.9)',
    textDecoration: 'none',
    fontSize: 12,
    fontWeight: 600
  },
  topActionButton: {
    border: '1px solid rgba(255, 255, 255, 0.35)',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    borderRadius: t.radius.sm,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer'
  },
  content: {
    padding: t.spacing.md
  },
  greeting: {
    margin: 0,
    color: '#2e2f2a',
    fontSize: 22,
    fontWeight: 700
  },
  subGreeting: {
    margin: '4px 0 14px',
    color: t.colors.textMuted,
    fontSize: 13
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.8fr 1fr',
    gap: t.spacing.md
  },
  leftColumn: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: t.spacing.md
  },
  rightColumn: {
    display: 'grid',
    gap: t.spacing.md
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    border: `1px solid ${t.colors.borderSoft}`,
    boxShadow: t.shadow.card,
    padding: t.spacing.sm
  },
  cardTitle: {
    margin: 0,
    fontSize: 13,
    color: '#3d4a42',
    fontWeight: 700
  },
  statValue: {
    margin: '8px 0 4px',
    color: t.colors.brand,
    fontSize: 22,
    fontWeight: 700
  },
  statMeta: {
    margin: 0,
    fontSize: 12,
    color: '#65756b'
  },
  progressTrack: {
    marginTop: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e7ece4',
    overflow: 'hidden'
  },
  progressBar: {
    height: '100%',
    width: '83%',
    backgroundColor: '#28a463'
  },
  barRow: {
    marginTop: 8,
    display: 'flex',
    alignItems: 'flex-end',
    gap: 7,
    height: 76
  },
  bar: {
    flex: 1,
    backgroundColor: '#dbe7d8',
    borderRadius: 6
  },
  barActive: {
    backgroundColor: '#28a463'
  },
  list: {
    margin: '10px 0 0',
    padding: 0,
    listStyle: 'none',
    display: 'grid',
    gap: 8
  },
  listItem: {
    border: `1px solid ${t.colors.borderSoft}`,
    borderRadius: 8,
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#3f4d44',
    backgroundColor: '#fbfbf8'
  },
  highlightCard: {
    background: 'linear-gradient(115deg, #1d6a49, #2a7f56)',
    color: '#ffffff'
  },
  highlightTitle: {
    margin: 0,
    fontSize: 13,
    opacity: 0.9
  },
  highlightValue: {
    margin: '8px 0 4px',
    fontSize: 24,
    fontWeight: 700
  },
  footer: {
    marginTop: t.spacing.md,
    borderTop: `1px solid ${t.colors.borderSoft}`,
    paddingTop: t.spacing.sm,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: t.spacing.md
  },
  footerTitle: {
    margin: 0,
    fontSize: 12,
    color: '#4e5a52',
    fontWeight: 700
  },
  footerText: {
    margin: '6px 0 0',
    fontSize: 12,
    color: '#5f6e64',
    lineHeight: 1.45
  }
};
