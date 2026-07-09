import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { roleLabel } from '../../utils/roles';

const EMPTY_FORM = { email: '', password: '', role: 'PHYSICAL_TRAINER' };

const STAFF_ROLES = [
  { value: 'PHYSICAL_TRAINER', label: 'Coordinador' },
  { value: 'RECEPTION', label: 'Recepción' },
];

export default function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset-password modal
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    api.get('/users').then(setUsers).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const u = await api.post('/users', form);
      setUsers([...users, u].sort((a, b) => a.email.localeCompare(b.email)));
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u) {
    const action = u.active ? 'desactivar' : 'reactivar';
    if (!confirm(`¿Seguro que quieres ${action} a ${u.email}?`)) return;
    try {
      const updated = await api.put(`/users/${u.id}`, { active: !u.active });
      setUsers(users.map((x) => (x.id === u.id ? updated : x)));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setResetSaving(true);
    setResetError('');
    try {
      await api.put(`/users/${resetTarget.id}`, { password: resetPassword });
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetSaving(false);
    }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Usuarios</h1>
        <button
          className="btn btn-primary"
          style={{ marginLeft: 'auto', minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
          onClick={() => setShowForm(true)}
        >
          + Nuevo
        </button>
      </div>

      <div className="page-content">
        <p className="text-sm text-gray mb-3">
          Cuentas de Coordinador y Recepción. Los profesores y asistentes se gestionan en sus propias secciones.
        </p>

        {showForm && (
          <div className="card mb-4">
            <h3 className="mb-3">Nuevo usuario</h3>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Rol *</label>
                <select className="form-input form-select" value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {STAFF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Correo electrónico *</label>
                <input type="email" className="form-input" required maxLength={254}
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña inicial (mín. 8 caracteres) *</label>
                <input type="password" className="form-input" required minLength={8} maxLength={128}
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        )}

        {users.length === 0 ? (
          <div className="alert alert-info">No hay cuentas de Coordinador o Recepción.</div>
        ) : (
          users.map((u) => (
            <div key={u.id} className="card mb-2">
              <div className="flex items-center justify-between">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="font-medium">{u.email}</div>
                  <div className="text-xs text-gray">
                    {roleLabel(u.role)}
                    {!u.active && <span className="badge badge-red" style={{ marginLeft: 6 }}>Inactivo</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-ghost" style={{ minHeight: 32, padding: '0 8px', fontSize: '0.75rem' }}
                    onClick={() => { setResetTarget(u); setResetPassword(''); setResetError(''); }}>
                    Contraseña
                  </button>
                  <button className="btn btn-ghost"
                    style={{ minHeight: 32, padding: '0 8px', fontSize: '0.75rem', color: u.active ? 'var(--red)' : 'var(--green)' }}
                    onClick={() => toggleActive(u)}>
                    {u.active ? 'Desactivar' : 'Reactivar'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {resetTarget && (
        <div className="modal-overlay" onClick={() => setResetTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3">Restablecer contraseña</h3>
            <p className="text-sm text-gray mb-3">{resetTarget.email}</p>
            {resetError && <div className="alert alert-error">{resetError}</div>}
            <form onSubmit={handleReset}>
              <div className="form-group">
                <label className="form-label">Nueva contraseña (mín. 8 caracteres) *</label>
                <input type="password" className="form-input" required minLength={8} maxLength={128}
                  value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} autoFocus />
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setResetTarget(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={resetSaving}>
                  {resetSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
