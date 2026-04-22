import type { ReactNode } from 'react';
import { BrandMark, NavAnchor, SurfaceCard } from '../atoms/HomeAtoms';
import { homePageStyles as styles } from '../styles/homePageStyles';
import { Link } from 'react-router-dom';

export function BrandBlock() {
  return (
    <Link to="/" style={styles.brandWrap}>
      <BrandMark />
      <p style={styles.brandText}>Ilm Tracker</p>
    </Link>
  );
}

export function HeaderNav() {
  const links = [
    { href: '#about', label: 'About' },
    { href: '#academics', label: 'Academics' },
    { href: '#programs', label: 'Programs' },
    { href: '#admissions', label: 'Admissions' },
    { href: '#news', label: 'News' },
    { href: '#contact', label: 'Contact' }
  ];

  return (
    <nav style={styles.nav} aria-label="Primary">
      {links.map(link => (
        <NavAnchor key={link.href} href={link.href}>
          {link.label}
        </NavAnchor>
      ))}
    </nav>
  );
}

export function InfoCard({ title, body, id }: { title: string; body: string; id?: string }) {
  return (
    <SurfaceCard style={{ scrollMarginTop: 16 }}>
      <h3 id={id} style={styles.cardTitle}>
        {title}
      </h3>
      <p style={styles.cardBody}>{body}</p>
    </SurfaceCard>
  );
}

export function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div style={styles.impactItem}>
      <strong style={styles.impactValue}>{value}</strong>
      <span style={styles.impactLabel}>{label}</span>
    </div>
  );
}

export function HomeSection({ children }: { children: ReactNode }) {
  return <section style={styles.section}>{children}</section>;
}
