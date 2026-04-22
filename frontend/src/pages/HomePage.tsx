import {
  HomeFeatures,
  HomeHeader,
  HomeHero,
  HomeImpact
} from '../components/organisms/home';
import { homePageStyles as styles } from '../components/styles/homePageStyles';

export default function HomePage() {
  return (
    <main style={styles.screen}>
      <HomeHeader />
      <HomeHero />
      <HomeFeatures />
      <HomeImpact />
    </main>
  );
}
