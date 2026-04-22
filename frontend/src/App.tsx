import { Outlet, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { loggedInPageStyles as styles } from './components/styles/loggedInPageStyles';

export default function App() {
  const { user, logout } = useAuth();

  if (!user) {
    return <Outlet />;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f2eb' }}>
      <nav style={styles.topBar}>
        <div style={styles.topBarLeft}>
          <p style={styles.brand}>Ilm Tracker</p>
          <div style={styles.topNav}>
            <Link to="/logged-in" style={styles.topNavItem}>
              Dashboard
            </Link>
            {(user.role === 'teacher' || user.role === 'admin') && (
              <Link to="/attendance" style={styles.topNavItem}>
                Attendance
              </Link>
            )}
            {user.role === 'admin' && (
              <Link to="/admin" style={styles.topNavItem}>
                Admin
              </Link>
            )}
          </div>
        </div>
        <div style={styles.topBarRight}>
          <span style={styles.topNavItem}>{user.role}</span>
          <button onClick={logout} style={styles.topActionButton}>
            Logout
          </button>
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
