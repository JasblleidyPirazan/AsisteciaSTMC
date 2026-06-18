import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Banner, Header, Loading } from '../../components/ui.jsx';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// HU-GRP-01: crear grupo y listar grupos existentes.
export default function Groups() {
  const [groups, setGroups] = useState(null);
  const [professors, setProfessors] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    professorId: '', dayIndices: [], startTime: '15:45', endTime: '16:30', court: 1, ballLevel: 'VERDE',
  });

  function load() {
    Promise.all([api.get('/groups'), api.get('/admin/users?role=TEACHER')])
      .then(([g, u]) => {
        setGroups(g.groups);
        setProfessors(u.users);
        setForm((f) => ({ ...f, professorId: f.professorId || u.users[0]?.id || '' }));
      })
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  function toggleDay(i) {
    setForm((f) => ({
      ...f,
      dayIndices: f.dayIndices.includes(i) ? f.dayIndices.filter((d) => d !== i) : [...f.dayIndices, i].sort(),
    }));
  }

  async function create(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/groups', {
        ...form,
        court: Number(form.court),
      });
      setForm((f) => ({ ...f, dayIndices: [] }));
      load();
    } catch (err) { setError(err.message); }
  }

  if (!groups) return <Loading />;

  const minutes = (() => {
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  })();

  return (
    <>
      <Header title="Grupos" back="/admin" />
      <div className="content">
        {error && <Banner>{error}</Banner>}

        <form className="card stack" onSubmit={create}>
          <h2 style={{ fontSize: '1rem', margin: 0 }}>Nuevo grupo</h2>
          <div className="field" style={{ margin: 0 }}>
            <label>Profesor titular</label>
            <select value={form.professorId} onChange={(e) => setForm((f) => ({ ...f, professorId: e.target.value }))} required>
              <option value="" disabled>Selecciona…</option>
              {professors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '.9rem', fontWeight: 600 }}>Días</label>
            <div className="btn-group" style={{ flexWrap: 'wrap' }}>
              {DAYS.map((d, i) => (
                <button type="button" key={d}
                  className={`status-btn ${form.dayIndices.includes(i) ? 'P active' : ''}`}
                  onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
          </div>
          <div className="btn-group">
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label>Inicio</label>
              <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label>Fin</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
            </div>
          </div>
          <p className="muted">Duración: {minutes} min → {minutes >= 90 ? 'doble (2.0)' : 'sencilla (1.0)'}</p>
          <div className="btn-group">
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label>Cancha</label>
              <input type="number" min="1" value={form.court} onChange={(e) => setForm((f) => ({ ...f, court: e.target.value }))} />
            </div>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label>Nivel</label>
              <select value={form.ballLevel} onChange={(e) => setForm((f) => ({ ...f, ballLevel: e.target.value }))}>
                <option value="VERDE">Verde</option>
                <option value="AMARILLA">Amarilla</option>
                <option value="NARANJA">Naranja</option>
                <option value="ROJA">Roja</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" disabled={!form.dayIndices.length || !form.professorId}>Crear grupo</button>
        </form>

        <h2 style={{ fontSize: '1rem' }}>Grupos ({groups.length})</h2>
        {groups.map((g) => (
          <div className="card" key={g.id}>
            <div className="row">
              <strong>{g.code}</strong>
              <span className={`tag ${Number(g.classUnits) >= 2 ? 'doble' : ''}`}>{Number(g.classUnits) >= 2 ? 'doble' : 'sencilla'}</span>
            </div>
            <div className="muted">{g.startTime}-{g.endTime} · Cancha {g.court} · {g.professor?.name}</div>
          </div>
        ))}
      </div>
    </>
  );
}
