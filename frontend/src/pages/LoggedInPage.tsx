import { useAuth } from '../AuthContext';

export default function LoggedInPage() {
  const { user } = useAuth();

  return (
    <div>
      <h2>Successfully logged in</h2>
      {user && (
        <p>
          Welcome, {user.fullName}! Your role is {user.role}.
        </p>
      )}
    </div>
  );
}
