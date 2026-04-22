import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { registerFormStyles as styles } from '../components/styles/registerFormStyles';
import { LoginForm } from '../components/organisms/login';
import { HomeHeader } from '../components/organisms/home';

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
      <HomeHeader />
      <div style={styles.content}>
        <div style={{ ...styles.container, maxWidth: 560 }}>
          <h2 style={styles.title}>Welcome Back</h2>
          <p style={styles.subtitle}>Sign in to access your student portal and progress tools.</p>
          {error && <p style={styles.errorMessage}>{error}</p>}

          <form onSubmit={handleSubmit} style={styles.form}>
            <LoginForm
              email={email}
              password={password}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
            />
          </form>

          <div style={styles.helperLinks}>
            <Link to="/" style={styles.helperLink}>
              Back to Home
            </Link>
            <Link to="/register" style={styles.helperLink}>
              New student? Enroll here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
