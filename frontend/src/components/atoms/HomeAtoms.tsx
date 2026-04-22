import type { CSSProperties, ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';
import { homeButtonStyles, homePageStyles as styles } from '../styles/homePageStyles';

type CTAButtonProps = {
  to: To;
  variant?: 'primary' | 'secondary';
  children: ReactNode;
};

export function BrandMark() {
  return <div style={styles.brandMark}>🌙</div>;
}

export function NavAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} style={styles.navLink}>
      {children}
    </a>
  );
}

export function CTAButton({ to, variant = 'primary', children }: CTAButtonProps) {
  const variantStyle = variant === 'secondary' ? homeButtonStyles.secondary : homeButtonStyles.primary;
  return (
    <Link to={to} style={{ ...homeButtonStyles.base, ...variantStyle }}>
      {children}
    </Link>
  );
}

export function SurfaceCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <article style={{ ...styles.card, ...style }}>{children}</article>;
}
