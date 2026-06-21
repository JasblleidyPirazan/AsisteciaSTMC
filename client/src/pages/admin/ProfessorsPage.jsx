import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

const EMPTY_FORM = { name: '', email: '', password: '', createAccount: false };

export default function ProfessorsPage() {
  const navigate = useNavigate();
  const [professors, setProfessors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/professors', { active: 'true' })
      .then(setProfessors)
      .finally(() => setLoading(false));
  }, []);

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { name: form.name };
      if (form.createAccount && form.email && form.password) {
        payload.email = form.email;
        payload.password = form.password;
      }
      const p = await api.post('/professors', payload);
      setProfessors([...professors, p]);
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id) {
    if (!confirm('¿Desactivar profesor?')) return;
    await api.put(`/professors/${id}`, { active: false });
    setProfessors(professors.filter((p) => p.id !== id));
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Profesores</h1>
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
            <h3 className="mb-3">Nuevo profesor</h3>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input type="text" className="form-input" required
                  value={form.name} onChange={(e) => setField('name', e.target.value)} maxLength={200} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.createAccount}
                  onChange={(e) => setField('createAccount', e.target.checked)} />
                <span className="text-sm">Crear cuenta de acceso</span>
              </label>

              {form.createAccount && (
                <>
                  <div className="form-group">
                    <label className="form-label">Correo electrónico</label>
                    <input type="email" className="form-input" value={form.email}
                      onChange={(e) => setField('email', e.target.value)} maxLength={254} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña inicial (mín. 8 caracteres)</label>
                    <input type="password" className="form-input" value={form.password} minLength={8}
                      onChange={(e) => setField('password', e.target.value)} maxLength={128} />
                  </div>
                </>
              )}

              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear profesor'}
                </button>
              </div>
            </form>
          </div>
        )}

        {professors.length === 0 ? (
          <div className="alert alert-info">No hay profesores activos.</div>
        ) : (
          professors.map((p) => (
            <div key={p.id} className="card mb-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.name}</div>
                  {p.user?.email && (
                    <div className="text-xs text-gray">{p.user.email}</div>
                  )}
                  {p.groups?.length > 0 && (
                    <div className="text-xs text-gray">
                      {p.groups.map((g) => g.code).join(' · ')}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ minHeight: 32, padding: '0 8px', fontSize: '0.8rem', color: 'var(--red)' }}
                  onClick={() => handleDeactivate(p.id)}
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
