import { HomeSection, InfoCard } from '../../molecules/HomeMolecules';
import { homePageStyles as styles } from '../../styles/homePageStyles';

export function HomeFeatures() {
  return (
    <HomeSection>
      <div style={styles.cardsGrid}>
        <InfoCard
          id="academics"
          title="Learning Modules"
          body="Sample modules and curriculum placeholders for academic progress tracking."
        />
        <InfoCard
          id="programs"
          title="Program Tracker"
          body="Track milestones, attendance, and engagement across configurable programs."
        />
        <InfoCard
          id="admissions"
          title="Student Dashboard"
          body="Visual snapshots for attendance, achievements, and activity trends."
        />
      </div>
    </HomeSection>
  );
}
