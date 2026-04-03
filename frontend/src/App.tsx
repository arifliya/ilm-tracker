import { Outlet, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function App() {
  const { user, logout } = useAuth();

  return (
    <div>
      <nav style={{ display: 'flex', gap: '1rem', padding: '1rem' }}>
        <Link to="/">Home</Link>

        {!user && (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}

        {user && (
          <>
            <Link to="/logged-in">Dashboard</Link>
            {(user.role === 'teacher' || user.role === 'admin') && (
              <Link to="/attendance">Attendance</Link>
            )}
            {user.role === 'admin' && <Link to="/admin">Admin</Link>}
            <button onClick={logout}>Logout</button>
          </>
        )}
      </nav>

      <Outlet />
    </div>
  );
}
