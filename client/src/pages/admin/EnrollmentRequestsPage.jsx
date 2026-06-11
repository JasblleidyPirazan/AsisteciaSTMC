import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate as fmtDateUtil } from '../../utils/dates';

function fmtDate(d) {
  if (!d) return '—';
  return fmtDateUtil(d);
}

function calculateAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate.slice(0, 10) + 'T00:00:00');
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function EnrollmentRequestsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [viewing, setViewing] = useState(null);
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
        <h1>Inscripciones</h1>
        <span className="badge badge-blue" style={{ marginLeft: 'auto' }}>{requests.length}</span>
      </div>

      {/* Payment proof lightbox */}
      {viewing && (
        <div
          onClick={() => setViewing(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <img src={viewing} alt="Soporte de pago"
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }}
            onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setViewing(null)}
            style={{
              position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.15)',
              color: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36,
              cursor: 'pointer', fontSize: '1.1rem',
            }}>✕</button>
        </div>
      )}

      <div className="page-content">
        {requests.length === 0 ? (
          <div className="alert alert-info">No hay solicitudes pendientes.</div>
        ) : (
          requests.map((r) => {
            const age = calculateAge(r.birthDate);
            return (
              <div key={r.id} className="card mb-3">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">{r.studentName}</div>
                  <span className="text-xs text-gray">
                    {new Date(r.submittedAt).toLocaleDateString('es-CO')}
                  </span>
                </div>

                {/* Student info */}
                {r.birthDate && (
                  <div className="text-sm text-gray mb-1">
                    🎂 {fmtDate(r.birthDate)}{age !== null ? ` · ${age} años` : ''}
                  </div>
                )}

                {/* Guardian */}
                {r.parentName && (
                  <div className="text-sm text-gray mb-1">👤 Acudiente: {r.parentName}</div>
                )}

                {/* Contact */}
                <div className="text-sm text-gray mb-1">📧 {r.email}</div>
                {r.phone && <div className="text-sm text-gray mb-1">📱 {r.phone}</div>}
                {r.eps && <div className="text-sm text-gray mb-1">🏥 EPS: {r.eps}</div>}

                {/* Payment */}
                {(r.paymentDate || r.paymentProof) && (
                  <div className="flex items-center gap-2 mb-1" style={{ flexWrap: 'wrap' }}>
                    {r.paymentDate && (
                      <span className="text-sm text-gray">💳 Pago: {fmtDate(r.paymentDate)}</span>
                    )}
                    {r.paymentProof && (
                      <button type="button" className="btn btn-ghost"
                        style={{ minHeight: 28, padding: '0 10px', fontSize: '0.78rem' }}
                        onClick={() => setViewing(r.paymentProof)}>
                        Ver comprobante 🖼
                      </button>
                    )}
                  </div>
                )}

                {/* Notes */}
                {r.notes && (
                  <div className="text-sm text-gray mb-2"
                    style={{ background: 'var(--gray-50)', borderRadius: 6, padding: '6px 10px' }}>
                    💬 {r.notes}
                  </div>
                )}

                {/* Actions */}
                {approving === r.id ? (
                  <div>
                    <div className="divider" style={{ margin: '12px 0' }} />
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
                  <div className="flex gap-2 mt-2">
                    <button className="btn btn-outline" style={{ flex: 1, color: 'var(--red)', minHeight: 40 }}
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
            );
          })
        )}
      </div>
    </div>
  );
}
