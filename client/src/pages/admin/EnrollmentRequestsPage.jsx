import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

export default function EnrollmentRequestsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [form, setForm] = useState({ groupId: '', parentPassword: '' });

  useEffect(() => {
    Promise.all([
      api.get('/enrollment/requests', { status: 'PENDING' }),
      api.get('/groups', { active: 'true' }),
    ]).then(([r, g]) => { setRequests(r); setGroups(g); }).finally(() => setLoading(false));
  }, []);

  async function handleApprove(req) {
    if (!form.parentPassword) { alert('Ingresa una contraseña inicial para el padre'); return; }
    try {
      await api.post(`/enrollment/requests/${req.id}/approve`, {
        groupId: form.groupId || undefined,
        parentPassword: form.parentPassword,
      });
      setRequests(requests.filter((r) => r.id !== req.id));
      setApproving(null);
      setForm({ groupId: '', parentPassword: '' });
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleReject(id) {
    if (!confirm('¿Rechazar solicitud?')) return;
    await api.post(`/enrollment/requests/${id}/reject`, {});
    setRequests(requests.filter((r) => r.id !== id));
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Solicitudes de Inscripción</h1>
        <span className="badge badge-blue" style={{ marginLeft: 'auto' }}>{requests.length}</span>
      </div>

      <div className="page-content">
        {requests.length === 0 ? (
          <div className="alert alert-info">No hay solicitudes pendientes.</div>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="card mb-3">
              <div className="font-medium mb-1">{r.studentName}</div>
              <div className="text-sm text-gray mb-1">Padre: {r.parentName}</div>
              <div className="text-sm text-gray mb-1">📧 {r.email}</div>
              {r.phone && <div className="text-sm text-gray mb-1">📱 {r.phone}</div>}
              {r.notes && <div className="text-sm text-gray mb-2">💬 {r.notes}</div>}
              <div className="text-xs text-gray mb-3">
                {new Date(r.submittedAt).toLocaleDateString('es-CO')}
              </div>

              {approving === r.id ? (
                <div>
                  <div className="form-group">
                    <label className="form-label">Asignar grupo (opcional)</label>
                    <select className="form-input form-select" value={form.groupId}
                      onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
                      <option value="">Sin grupo por ahora</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña inicial para el padre *</label>
                    <input type="text" className="form-input" value={form.parentPassword}
                      onChange={(e) => setForm({ ...form, parentPassword: e.target.value })}
                      placeholder="ej: tenis2025" />
                    <span className="text-xs text-gray">El padre debe cambiarla al primer ingreso</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setApproving(null)}>
                      Cancelar
                    </button>
                    <button className="btn btn-success" style={{ flex: 2 }} onClick={() => handleApprove(r)}>
                      ✅ Aprobar y crear cuenta
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className="btn btn-outline btn-danger" style={{ flex: 1, color: 'var(--red)', minHeight: 40 }}
                    onClick={() => handleReject(r.id)}>
                    Rechazar
                  </button>
                  <button className="btn btn-success" style={{ flex: 2, minHeight: 40 }}
                    onClick={() => setApproving(r.id)}>
                    Aprobar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
