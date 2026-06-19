import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Banner, Empty, Loading } from '../components/ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);

// HU-AST-08: el asistente marca qué clases del día acompañó.
export default function AssistantDay() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/sessions/assistant/today?date=${today()}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function toggle(c) {
    setError(null);
    try {
      await api.post('/sessions/assistant/accompany', {
        groupId: c.groupId, date: today(), accompanied: !c.accompanied,
      });
      load();
    } catch (e) { setError(e.message); }
  }

  if (error && !data) return <div className="content"><Banner>{error}</Banner></div>;
  if (!data) return <Loading message="Cargando clases…" />;

  return (
    <>
      <header className="app-header">
        <h1>Clases de hoy</h1>
        {user.role === 'ADMIN' && <button className="back" onClick={() => navigate('/')}>⌂</button>}
        <button className="back" onClick={logout}>⎋</button>
      </header>
      <div className="content">
        {error && <Banner>{error}</Banner>}
        <p className="muted">Marca las clases que acompañaste.</p>
        {data.classes.length === 0 && <Empty>No hay clases hoy.</Empty>}
        {data.classes.map((c) => (
          <div key={c.groupId} className="card">
            <div className="row">
              <div>
                <strong>{c.startTime}</strong> · {c.code}
                <div className="muted">{c.professor} · <span className={`tag ${c.classType === 'doble' ? 'doble' : ''}`}>{c.classType}</span></div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={c.accompanied}
                  disabled={!c.sessionId}
                  onChange={() => toggle(c)}
                />
                <span className="slider" />
              </label>
            </div>
            {!c.sessionId && <p className="muted" style={{ marginTop: 6 }}>Aún sin reporte del profesor</p>}
          </div>
        ))}
        <div className="spacer" />
        <button className="btn btn-outline" onClick={() => navigate('/my-settlement')}>💰 Mi liquidación</button>
      </div>
    </>
  );
}
