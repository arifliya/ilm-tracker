import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

interface User {
  id: number;
  full_name: string;
  email: string;
  role: string;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    api.get('/admin/users').then(res => setUsers(res.data));
  }, []);

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      alert('Class name is required');
      return;
    }
    await api.post('/admin/classes', { name, description });
    alert('Class created');
  };

  const grantTeacher = async (id: number) => {
    await api.post(`/admin/users/${id}/grant-teacher`);
    alert('Teacher role granted');
  };

  if (!user || user.role !== 'admin') {
    return <p>Only administrators can access this page.</p>;
  }

  return (
    <div>
      <h2>Madressa Administrator</h2>

      <section>
        <h3>Create Class</h3>
        <form onSubmit={createClass}>
          <input
            placeholder="Class name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            placeholder="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <button>Create</button>
        </form>
      </section>

      <section>
        <h3>Teachers & Students</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  {u.role !== 'teacher' && (
                    <button onClick={() => grantTeacher(u.id)}>
                      Grant Teacher
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
