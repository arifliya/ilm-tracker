import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { dashboardStyles as styles } from "../../styles/dashboardStyles";
import BaseDashboard, { DashboardNavItem } from "../../components/BaseDashboard";
import FeeTrackingSection from "../../components/FeeTrackingSection";
import { getErrorMessage } from "../../utils/getErrorMessage";

type SectionKey = "fees";

const NAV_ITEMS: DashboardNavItem[] = [{ key: "fees", icon: "💰", label: "Fee Tracking" }];

const SECTION_TITLES: Record<SectionKey, string> = {
  fees: "Fee Tracking"
};

const TreasurerDashboard: React.FC = () => {
  const [selectedSection, setSelectedSection] = useState<SectionKey>("fees");
  const [feesEnabled, setFeesEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadFeatures = async () => {
      try {
        const res = await api.get("/features");
        setFeesEnabled(!!res.data?.flags?.fees);
        setLoadError(null);
      } catch (err) {
        setLoadError(getErrorMessage(err, "Failed to load dashboard data."));
      } finally {
        setLoading(false);
      }
    };
    loadFeatures();
  }, []);

  return (
    <BaseDashboard
      navItems={NAV_ITEMS}
      selectedSection={selectedSection}
      onSelectSection={key => setSelectedSection(key as SectionKey)}
      title={SECTION_TITLES[selectedSection]}
      loading={loading}
      error={loadError}
      onDismissError={() => setLoadError(null)}
    >
      {feesEnabled ? (
        <FeeTrackingSection />
      ) : (
        <div style={styles.card}>
          <p style={styles.text}>Fee tracking is not currently enabled for your school. Contact your system admin.</p>
        </div>
      )}
    </BaseDashboard>
  );
};

export default TreasurerDashboard;
