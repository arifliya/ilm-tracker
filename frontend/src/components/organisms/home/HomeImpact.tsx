import { MetricCard } from '../../molecules/HomeMolecules';
import { homePageStyles as styles } from '../../styles/homePageStyles';

export function HomeImpact() {
  return (
    <section id="news" style={styles.impactSection}>
      <h2 style={styles.impactTitle}>Recent Highlights & Activity</h2>
      <div style={styles.impactGrid}>
        <MetricCard value="22+" label="Completed projects" />
        <MetricCard value="95%" label="Active participation" />
        <MetricCard value="48" label="Community events" />
        <MetricCard value="100%" label="Weekly updates sent" />
      </div>
    </section>
  );
}
