import { useState } from 'react';
import { api } from '../api';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    try {
      const res = await api.post('/auth/register', {
        fullName,
        dob,
        email,
        password
      });
      setMessage(res.data.message);
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Registration failed');
    }
  };

  return (
    <div>
      <h2>Register</h2>
      {message && <p>{message}</p>}

      <form onSubmit={handleSubmit}>
        <div>
          <label>Full name</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>

        <div>
          <label>Date of birth</label>
          <input type="date" value={dob} onChange={e => setDob(e.target.value)} />
        </div>

        <div>
          <label>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        <div>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        <button>Register</button>
      </form>
    </div>
  );
}
