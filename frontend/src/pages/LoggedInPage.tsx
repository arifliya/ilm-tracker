import { useAuth } from '../AuthContext';
import { LoggedInDashboard } from '../components/organisms/dashboard';

export default function LoggedInPage() {
  const { user } = useAuth();

  return <LoggedInDashboard fullName={user?.fullName} role={user?.role} />;
}
