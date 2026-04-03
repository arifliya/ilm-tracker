import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';

interface Class {
  id: number;
  name: string;
}

interface Student {
  id: number;
  full_name: string;
  email: string;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<number, boolean>>({});

  useEffect(() => {
    api.get('/teacher/classes').then(res => setClasses(res.data));
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;

    api
      .get(`/teacher/classes/${selectedClassId}/students`)
      .then(res => {
        setStudents(res.data);
        const initial: Record<number, boolean> = {};
        res.data.forEach((s: Student) => (initial[s.id] = true));
        setAttendance(initial);
      });
  }, [selectedClassId]);

  const submitAttendance = async () => {
    const records = Object.entries(attendance).map(([id, present]) => ({
      studentId: Number(id),
      present
    }));

    await api.post(`/teacher/classes/${selectedClassId}/attendance`, {
      date: new Date().toISOString().slice(0, 10),
      records
    });

    alert('Attendance saved');
  };

  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return <p>Only teachers can view attendance.</p>;
  }

  return (
    <div>
      <h2>Class Attendance</h2>

      <select
        value={selectedClassId ?? ''}
        onChange={e => setSelectedClassId(Number(e.target.value))}
      >
        <option value="">Select class</option>
        {classes.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {students.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Present</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td>{s.full_name}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={attendance[s.id]}
                      onChange={e =>
                        setAttendance(prev => ({
                          ...prev,
                          [s.id]: e.target.checked
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button onClick={submitAttendance}>Save Attendance</button>
        </>
      )}
    </div>
  );
}
