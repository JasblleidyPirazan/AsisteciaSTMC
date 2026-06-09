import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

export default function StudentsPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', primaryGroupId: '', secondaryGroupId: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/students', { active: 'true' }),
      api.get('/groups', { active: 'true' }),
    ]).then(([s, g]) => { setStudents(s); setGroups(g); }).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const s = await api.post('/students', form);
      setStudents([...students, s]);
      setShowForm(false);
      setForm({ name: '', email: '', primaryGroupId: '', secondaryGroupId: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id) {
    if (!confirm('¿Desactivar estudiante?')) return;
    await api.delete(`/students/${id}`);
    setStudents(students.filter((s) => s.id !== id));
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Estudiantes</h1>
        <button className="btn btn-primary" style={{ marginLeft: 'auto', minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
          onClick={() => setShowForm(true)}>
          + Nuevo
        </button>
      </div>

      <div className="page-content">
        {showForm && (
          <div className="card mb-4">
            <h3 className="mb-3">Nuevo estudiante</h3>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input type="text" className="form-input" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Grupo principal</label>
                <select className="form-input form-select" value={form.primaryGroupId}
                  onChange={(e) => setForm({ ...form, primaryGroupId: e.target.value })}>
                  <option value="">Sin grupo</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Grupo secundario (opcional)</label>
                <select className="form-input form-select" value={form.secondaryGroupId}
                  onChange={(e) => setForm({ ...form, secondaryGroupId: e.target.value })}>
                  <option value="">Sin grupo</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear estudiante'}
                </button>
              </div>
            </form>
          </div>
        )}

        {students.length === 0 ? (
          <div className="alert alert-info">No hay estudiantes activos.</div>
        ) : (
          students.map((s) => (
            <div key={s.id} className="card mb-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  {s.enrollments?.length > 0 && (
                    <div className="text-xs text-gray">
                      {s.enrollments.map((e) => e.group.code).join(' · ')}
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost" style={{ minHeight: 32, padding: '0 8px', fontSize: '0.8rem', color: 'var(--red)' }}
                  onClick={() => handleDeactivate(s.id)}>
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
