import { loggedInPageStyles as styles } from '../../styles/loggedInPageStyles';

type Props = {
  fullName?: string;
  role?: string;
};

const attendanceBars = [54, 64, 48, 72, 80, 68];

export function LoggedInDashboard({ fullName, role }: Props) {
  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <div style={styles.content}>
          <h1 style={styles.greeting}>Welcome back, {fullName ?? 'Student'}!</h1>
          <p style={styles.subGreeting}>
            Here is a quick overview of your current activity as {role ?? 'student'}.
          </p>

          <section style={styles.grid}>
            <div style={styles.leftColumn}>
              <article style={styles.card}>
                <h2 style={styles.cardTitle}>Daily Overview</h2>
                <p style={styles.statValue}>04 / 05</p>
                <p style={styles.statMeta}>tasks completed today</p>
                <div style={styles.progressTrack}>
                  <div style={styles.progressBar} />
                </div>
              </article>

              <article style={styles.card}>
                <h2 style={styles.cardTitle}>Weekly Attendance</h2>
                <p style={styles.statMeta}>83.5% this week</p>
                <div style={styles.barRow}>
                  {attendanceBars.map((height, idx) => (
                    <div
                      key={idx}
                      style={{
                        ...styles.bar,
                        ...(idx === 4 ? styles.barActive : {}),
                        height
                      }}
                    />
                  ))}
                </div>
              </article>

              <article style={{ ...styles.card, ...styles.highlightCard }}>
                <h2 style={styles.highlightTitle}>Progress Snapshot</h2>
                <p style={styles.highlightValue}>75%</p>
                <p style={{ ...styles.statMeta, color: 'rgba(255, 255, 255, 0.9)' }}>
                  on-track milestone completion
                </p>
              </article>

              <article style={styles.card}>
                <h2 style={styles.cardTitle}>Upcoming Events</h2>
                <ul style={styles.list}>
                  <li style={styles.listItem}>
                    <span>Parent Meeting</span>
                    <span>Thu</span>
                  </li>
                  <li style={styles.listItem}>
                    <span>Progress Review</span>
                    <span>Sat</span>
                  </li>
                </ul>
              </article>
            </div>

            <aside style={styles.rightColumn}>
              <article style={styles.card}>
                <h2 style={styles.cardTitle}>Quick Stats</h2>
                <ul style={styles.list}>
                  <li style={styles.listItem}>
                    <span>Classes</span>
                    <span>6</span>
                  </li>
                  <li style={styles.listItem}>
                    <span>Assignments</span>
                    <span>12</span>
                  </li>
                  <li style={styles.listItem}>
                    <span>Alerts</span>
                    <span>2</span>
                  </li>
                </ul>
              </article>

              <article style={styles.card}>
                <h2 style={styles.cardTitle}>Profile Highlight</h2>
                <p style={styles.footerText}>
                  Placeholder content block for profile media or school announcements.
                </p>
              </article>
            </aside>
          </section>

          <footer style={styles.footer}>
            <div>
              <h3 style={styles.footerTitle}>Contact Info</h3>
              <p style={styles.footerText}>+44 1234 567 890</p>
            </div>
            <div>
              <h3 style={styles.footerTitle}>Quick Links</h3>
              <p style={styles.footerText}>Overview, Tasks, Attendance</p>
            </div>
            <div>
              <h3 style={styles.footerTitle}>Portal</h3>
              <p style={styles.footerText}>Powered by Ilm Tracker</p>
            </div>
          </footer>
        </div>
      </section>
    </main>
  );
}
