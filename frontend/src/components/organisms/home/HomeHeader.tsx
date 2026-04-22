import { HeaderNav, BrandBlock } from '../../molecules/HomeMolecules';
import { homePageStyles as styles } from '../../styles/homePageStyles';

export function HomeHeader() {
  return (
    <header style={styles.header}>
      <BrandBlock />
      <HeaderNav />
      <button type="button" style={styles.applyButton}>
        Apply Now
      </button>
    </header>
  );
}
