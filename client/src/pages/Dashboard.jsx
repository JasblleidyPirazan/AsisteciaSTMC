import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Banner, Empty, Loading, useOnline } from '../components/ui.jsx';
import { flushQueue, pendingCount } from '../api/offlineQueue.js';

const today = () => new Date().toISOString().slice(0, 10);

// HU-GRP-02: grupos del día. Pantalla de inicio según el rol del usuario.
export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(pendingCount());
  const [synced, setSynced] = useState(0);

  useEffect(() => {
    // Asistente tiene su propia pantalla.
    if (user.role === 'ASSISTANT') { navigate('/assistant', { replace: true }); return; }
    api.get(`/groups/today?date=${today()}`)
      .then((d) => setGroups(d.groups))
      .catch((e) => setError(e.message));
  }, [user.role, navigate]);

  // Al recuperar conexión, sincroniza reportes pendientes (HU-AST-07).
  useEffect(() => {
    if (online && pendingCount() > 0) {
      flushQueue().then((n) => { setSynced(n); setPending(pendingCount()); });
    }
  }, [online]);

  if (user.role === 'ASSISTANT') return <Loading />;
  if (error) return <div className="content"><Banner>{error}</Banner></div>;
  if (!groups) return <Loading message="Cargando grupos de hoy…" />;

  return (
    <>
      <header className="app-header">
        <h1>Hola, {user.name.split(' ')[0]}</h1>
        <button className="back" onClick={logout} title="Salir">⎋</button>
      </header>
      <div className="content">
        {!online && <Banner type="offline">Modo offline — los registros se guardarán y enviarán al reconectar</Banner>}
        {pending > 0 && <Banner type="offline">{pending} reporte(s) pendientes de sincronizar</Banner>}
        {synced > 0 && <Banner type="success">{synced} reporte(s) sincronizado(s)</Banner>}

        <h2 style={{ fontSize: '1.1rem' }}>Clases de hoy</h2>
        {groups.length === 0 && <Empty>No hay clases programadas para hoy.</Empty>}

        {groups.map((g) => (
          <div key={g.id} className="card tappable" onClick={() => navigate(`/attendance/${g.id}`)}>
            <div className="row">
              <strong>{g.startTime}</strong>
              <span className={`tag ${g.classType === 'doble' ? 'doble' : ''}`}>{g.classType}</span>
            </div>
            <div className="muted">Cancha {g.court} · Nivel {g.ballLevel}</div>
            <div className="muted">Profesor: {g.professor?.name}</div>
            <div className="muted">{g.studentCount} estudiante(s)</div>
          </div>
        ))}

        <div className="spacer" />
        {user.role === 'PARENT' && (
          <button className="btn btn-outline" onClick={() => navigate('/students')}>👦 Ver asistencia de mi hijo/a</button>
        )}
        {user.role === 'TEACHER' && (
          <div className="stack">
            <button className="btn btn-outline" onClick={() => navigate('/students')}>👥 Mis estudiantes</button>
            <button className="btn btn-outline" onClick={() => navigate('/my-settlement')}>💰 Mi liquidación</button>
          </div>
        )}
        {user.role === 'ADMIN' && (
          <div className="stack">
            <button className="btn btn-secondary" onClick={() => navigate('/admin')}>⚙️ Administración</button>
          </div>
        )}
      </div>
    </>
  );
}
