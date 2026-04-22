import { CTAButton } from '../../atoms/HomeAtoms';
import { homePageStyles as styles } from '../../styles/homePageStyles';

export function HomeHero() {
  return (
    <section style={styles.heroGrid}>
      <div style={styles.heroMain}>
        <div style={styles.heroContent}>
          <p style={styles.kicker}>Track progress, stay connected.</p>
          <h1 style={styles.heroTitle}>Welcome to Ilm Tracker.</h1>
          <p style={styles.heroBody}>
            A modern learning portal with dummy content for admissions, progress updates,
            and student information management.
          </p>
          <div style={styles.buttonRow}>
            <CTAButton to="/login">Login to Portal</CTAButton>
            <CTAButton to="/register" variant="secondary">
              Start Registration
            </CTAButton>
          </div>
        </div>
      </div>
    </section>
  );
}
