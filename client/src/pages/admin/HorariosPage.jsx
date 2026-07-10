import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { usePermissions } from '../../hooks/usePermissions';

const EMPTY = { name: '', startDate: '', endDate: '' };

export default function HorariosPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canEdit = can('horarios', 'edit');
  const [semesters, setSemesters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    return api.get('/semesters').then(setSemesters);
  }
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function activate(id) {
    if (!confirm('¿Activar este semestre? Los demás se desactivan.')) return;
    try { await api.put(`/semesters/${id}`, { active: true }); await load(); }
    catch (err) { alert(err.message); }
  }

  async function handleCreate(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/semesters', form);
      await load(); setShowForm(false); setForm(EMPTY);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Horarios y semestres</h1>
        {canEdit && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto', minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
            onClick={() => setShowForm(true)}>+ Semestre</button>
        )}
      </div>
      <div className="page-content">
        <p className="text-sm text-gray mb-3">
          Calendario académico. El semestre activo define el rango de fechas para asistencia y alertas.
        </p>

        {showForm && (
          <div className="card mb-4">
            <h3 className="mb-3">Nuevo semestre</h3>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: 2026-2" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Inicio *</label>
                  <input type="date" className="form-input" required value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fin *</label>
                  <input type="date" className="form-input" required value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        )}

        {semesters.length === 0 ? (
          <div className="alert alert-info">No hay semestres registrados.</div>
        ) : semesters.map((s) => (
          <div key={s.id} className="card mb-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {s.name} {s.active && <span className="badge badge-green" style={{ marginLeft: 6 }}>Activo</span>}
                </div>
                <div className="text-xs text-gray">
                  {String(s.startDate).slice(0, 10)} → {String(s.endDate).slice(0, 10)}
                </div>
              </div>
              {canEdit && !s.active && (
                <button className="btn btn-ghost" style={{ minHeight: 32, padding: '0 8px', fontSize: '0.8rem' }}
                  onClick={() => activate(s.id)}>Activar</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
