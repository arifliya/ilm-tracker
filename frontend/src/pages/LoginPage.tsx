import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { registerFormStyles as styles } from '../components/styles/registerFormStyles';
import { LoginForm } from '../components/organisms/login';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.data.user);
      navigate('/logged-in');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Login failed');
    }
  };

  return (
    <div style={styles.screen}>
      <div style={{ ...styles.container, maxWidth: 540 }}>
        <h2 style={styles.title}>Login</h2>
        {error && <p style={styles.errorMessage}>{error}</p>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <LoginForm
            email={email}
            password={password}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
          />
        </form>
      </div>
    </div>
  );
}
