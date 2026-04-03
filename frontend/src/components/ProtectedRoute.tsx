import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

interface Props {
  children: JSX.Element;
  allowedRoles?: ('student' | 'teacher' | 'admin')[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
