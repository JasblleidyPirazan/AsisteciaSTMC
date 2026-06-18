import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Banner, Empty, Header, Loading } from '../components/ui.jsx';

// Listado de estudiantes según rol (profesor: sus estudiantes; acudiente: sus hijos).
export default function Students() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/students').then((d) => setStudents(d.students)).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="content"><Banner>{error}</Banner></div>;
  if (!students) return <Loading />;

  const title = user.role === 'PARENT' ? 'Mis hijos/as' : 'Mis estudiantes';

  return (
    <>
      <Header title={title} back="/" />
      <div className="content">
        {students.length === 0 && <Empty>No hay estudiantes para mostrar.</Empty>}
        {students.map((s) => (
          <div key={s.id} className="card tappable" onClick={() => navigate(`/students/${s.id}`)}>
            <strong>{s.name}</strong>
            <div className="muted">
              {s.enrollments.map((e) => e.group.code).join(', ') || 'Sin grupo'}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
