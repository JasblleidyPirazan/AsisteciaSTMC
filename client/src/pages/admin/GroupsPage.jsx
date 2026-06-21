import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { buildGroupCode } from '../../utils/groupCode';

const DAYS = [
  { key: 'lunes', label: 'L' },
  { key: 'martes', label: 'M' },
  { key: 'miercoles', label: 'X' },
  { key: 'jueves', label: 'J' },
  { key: 'viernes', label: 'V' },
  { key: 'sabado', label: 'S' },
  { key: 'domingo', label: 'D' },
];

const BALL_LEVELS = ['Verde', 'Amarilla', 'Naranja', 'Roja'];

const EMPTY_FORM = {
  professorId: '', startTime: '15:00', endTime: '15:45',
  court: '', ballLevel: '', subLevel: '', minAge: '', maxAge: '',
  lunes: false, martes: false, miercoles: false, jueves: false,
  viernes: false, sabado: false, domingo: false,
};

function daysLabel(g) {
  return DAYS.filter((d) => g[d.key]).map((d) => d.label).join(' ');
}

export default function GroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Deactivation modal
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/groups', { active: 'true' }),
      api.get('/professors', { active: 'true' }),
    ]).then(([g, p]) => { setGroups(g); setProfessors(p); }).finally(() => setLoading(false));
  }, []);

  function toggleDay(key) {
    setForm((f) => ({ ...f, [key]: !f[key] }));
  }

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function derivedUnits() {
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins >= 80 ? 'Doble (2 unidades)' : 'Sencilla (1 unidad)';
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const g = await api.post('/groups', form);
      setGroups([...groups, g]);
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeactivate() {
    if (!deactivateReason.trim()) return;
    setDeactivating(true);
    try {
      await api.delete(`/groups/${deactivateTarget.id}`, { reason: deactivateReason.trim() });
      setGroups(groups.filter((g) => g.id !== deactivateTarget.id));
      setDeactivateTarget(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setDeactivating(false);
    }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Grupos</h1>
        <button
          className="btn btn-primary"
          style={{ marginLeft: 'auto', minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
          onClick={() => setShowForm(true)}
        >
          + Nuevo
        </button>
      </div>

      <div className="page-content">
        {showForm && (
          <div className="card mb-4">
            <h3 className="mb-3">Nuevo grupo</h3>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Código (automático)</label>
                <div className="form-input" style={{
                  display: 'flex', alignItems: 'center', background: 'var(--gray-50)',
                  fontWeight: 700, letterSpacing: '0.05em', color: 'var(--blue)',
                }}>
                  {buildGroupCode(form) || '—'}
                </div>
                <span className="text-xs text-gray">Días + hora + cancha + nivel. Se genera solo.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Profesor *</label>
                <select className="form-input form-select" required value={form.professorId}
                  onChange={(e) => setField('professorId', e.target.value)}>
                  <option value="">Seleccionar profesor</option>
                  {professors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Días</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {DAYS.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => toggleDay(d.key)}
                      style={{
                        width: 40, height: 40, borderRadius: '50%', border: '2px solid',
                        borderColor: form[d.key] ? 'var(--primary)' : 'var(--gray-300)',
                        background: form[d.key] ? 'var(--primary)' : 'transparent',
                        color: form[d.key] ? '#fff' : 'var(--gray-500)',
                        fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Inicio *</label>
                  <input type="time" className="form-input" required value={form.startTime}
                    onChange={(e) => setField('startTime', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fin *</label>
                  <input type="time" className="form-input" required value={form.endTime}
                    onChange={(e) => setField('endTime', e.target.value)} />
                </div>
              </div>
              {form.startTime && form.endTime && (
                <div className="text-xs text-gray mb-3">Tipo: {derivedUnits()}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Cancha</label>
                  <input type="number" className="form-input" min={1} max={20}
                    value={form.court} onChange={(e) => setField('court', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nivel de bola</label>
                  <select className="form-input form-select" value={form.ballLevel}
                    onChange={(e) => setField('ballLevel', e.target.value)}>
                    <option value="">Sin especificar</option>
                    {BALL_LEVELS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Subnivel</label>
                <input type="text" className="form-input" placeholder="Ej: Verde alto, iniciación..."
                  value={form.subLevel} onChange={(e) => setField('subLevel', e.target.value)} maxLength={60} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Edad mín.</label>
                  <input type="number" className="form-input" min={2} max={99}
                    value={form.minAge} onChange={(e) => setField('minAge', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Edad máx.</label>
                  <input type="number" className="form-input" min={2} max={99}
                    value={form.maxAge} onChange={(e) => setField('maxAge', e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear grupo'}
                </button>
              </div>
            </form>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="alert alert-info">No hay grupos activos.</div>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="card mb-2">
              <div className="flex items-center justify-between">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="font-medium">{g.code}</div>
                  <div className="text-xs text-gray">
                    {g.professor?.name} · {g.startTime}–{g.endTime}
                    {g.court ? ` · Cancha ${g.court}` : ''}
                    {g.ballLevel ? ` · ${g.ballLevel}` : ''}
                    {g.subLevel ? ` · ${g.subLevel}` : ''}
                    {(g.minAge || g.maxAge) ? ` · ${g.minAge || '?'}–${g.maxAge || '?'} años` : ''}
                  </div>
                  {daysLabel(g) && (
                    <div className="text-xs" style={{ color: 'var(--primary)', marginTop: 2 }}>
                      {daysLabel(g)}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ minHeight: 32, padding: '0 8px', fontSize: '0.8rem', color: 'var(--red)', flexShrink: 0 }}
                  onClick={() => { setDeactivateTarget(g); setDeactivateReason(''); }}
                >
                  Desactivar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {deactivateTarget && (
        <div className="modal-overlay" onClick={() => setDeactivateTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3">Desactivar grupo</h3>
            <p className="text-sm mb-3">
              Vas a desactivar el grupo <strong>{deactivateTarget.code}</strong>. Esta acción requiere un motivo.
            </p>
            <div className="form-group">
              <label className="form-label">Motivo *</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Ej: Fin de semestre, grupo disuelto por falta de estudiantes..."
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setDeactivateTarget(null)}>
                Cancelar
              </button>
              <button
                className="btn"
                style={{ flex: 2, background: 'var(--red)', color: '#fff' }}
                disabled={!deactivateReason.trim() || deactivating}
                onClick={confirmDeactivate}
              >
                {deactivating ? 'Desactivando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
