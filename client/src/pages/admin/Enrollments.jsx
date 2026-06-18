import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Banner, Empty, Header, Loading } from '../../components/ui.jsx';

// HU-INS-02: aprobar/rechazar solicitudes de inscripción.
export default function Enrollments() {
  const [requests, setRequests] = useState(null);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  function load() {
    Promise.all([
      api.get('/enrollment?status=PENDIENTE'),
      api.get('/groups'),
    ]).then(([r, g]) => { setRequests(r.requests); setGroups(g.groups); })
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function approve(req) {
    const groupId = req._groupId || groups[0]?.id;
    if (!groupId) { setError('Crea un grupo antes de aprobar'); return; }
    setError(null);
    try {
      const d = await api.post(`/enrollment/${req.id}/approve`, { groupId });
      setMsg(`Aprobada. Acceso: ${d.parent.email} / contraseña temporal: ${d.tempPassword}`);
      load();
    } catch (e) { setError(e.message); }
  }

  async function reject(req) {
    const reason = prompt('Motivo del rechazo:');
    if (!reason) return;
    try { await api.post(`/enrollment/${req.id}/reject`, { reason }); load(); }
    catch (e) { setError(e.message); }
  }

  if (error && !requests) return <div className="content"><Banner>{error}</Banner></div>;
  if (!requests) return <Loading />;

  return (
    <>
      <Header title="Inscripciones" back="/admin" />
      <div className="content">
        {error && <Banner>{error}</Banner>}
        {msg && <Banner type="success">{msg}</Banner>}
        {requests.length === 0 && <Empty>No hay solicitudes pendientes.</Empty>}
        {requests.map((r) => (
          <div className="card stack" key={r.id}>
            <div>
              <strong>{r.studentName}</strong>
              <div className="muted">Acudiente: {r.parentName}</div>
              <div className="muted">{r.email} · {r.phone}</div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Asignar a grupo</label>
              <select defaultValue={groups[0]?.id} onChange={(e) => { r._groupId = e.target.value; }}>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
              </select>
            </div>
            <div className="btn-group">
              <button className="btn btn-primary" onClick={() => approve(r)}>Aprobar</button>
              <button className="btn btn-outline" onClick={() => reject(r)}>Rechazar</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
