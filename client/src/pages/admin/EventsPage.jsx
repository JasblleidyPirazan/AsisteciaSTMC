import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import EmptyState from '../../components/EmptyState';
import { fmtDate } from '../../utils/dates';

const EMPTY_FORM = { name: '', date: '', professorId: '', fixedRate: '', description: '' };

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

export default function EventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/events'),
      api.get('/professors', { active: 'true' }),
    ]).then(([e, p]) => { setEvents(e); setProfessors(p); }).finally(() => setLoading(false));
  }, []);

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const ev = await api.post('/events', form);
      setEvents([ev, ...events]);
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id) {
    if (!confirm('¿Desactivar evento?')) return;
    await api.put(`/events/${id}`, { active: false });
    setEvents(events.filter((ev) => ev.id !== id));
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Eventos</h1>
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
            <h3 className="mb-3">Nuevo evento</h3>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input type="text" className="form-input" required placeholder="Torneo / Clínica"
                  value={form.name} onChange={(e) => setField('name', e.target.value)} maxLength={200} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input type="date" className="form-input" required
                  value={form.date} onChange={(e) => setField('date', e.target.value)} />
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
                <label className="form-label">Valor fijo al profesor (COP) *</label>
                <input type="number" className="form-input" required min={0} step={500}
                  value={form.fixedRate} onChange={(e) => setField('fixedRate', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea className="form-input" rows={2} maxLength={500}
                  value={form.description} onChange={(e) => setField('description', e.target.value)} />
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear evento'}
                </button>
              </div>
            </form>
          </div>
        )}

        {events.length === 0 ? (
          <EmptyState icon="🏆" title="No hay eventos"
            hint="Registra un torneo o clínica con su pago fijo."
            action={{ label: '+ Nuevo evento', onClick: () => setShowForm(true) }} />
        ) : (
          events.map((ev) => (
            <div key={ev.id} className="card mb-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{ev.name}</div>
                  <div className="text-xs text-gray">
                    {fmtDate(ev.date.slice(0, 10))} · {ev.professor?.name}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--primary)', marginTop: 2 }}>
                    {fmt(ev.fixedRate)}
                  </div>
                  {ev.description && (
                    <div className="text-xs text-gray mt-1">{ev.description}</div>
                  )}
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ minHeight: 32, padding: '0 8px', fontSize: '0.8rem', color: 'var(--red)', flexShrink: 0 }}
                  onClick={() => handleDeactivate(ev.id)}
                >
                  Desactivar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
