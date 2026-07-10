import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { roleLabel } from '../../utils/roles';

const EMPTY_FORM = { email: '', password: '', role: 'PHYSICAL_TRAINER' };

// Roles creables desde esta pantalla. Los "elevados" solo los ve/crea un
// Super Admin o Desarrollador (guardrail contra escalada de privilegios).
const BASIC_ROLES = [
  { value: 'PHYSICAL_TRAINER', label: 'Coordinador' },
  { value: 'RECEPTION', label: 'Recepción' },
  { value: 'READ_ONLY', label: 'Solo lectura' },
];
const ELEVATED_ROLES = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'DEVELOPER', label: 'Desarrollador' },
];

// Orden y estilo de badge por rol para la vista unificada.
const ROLE_ORDER = ['SUPER_ADMIN', 'DEVELOPER', 'ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION', 'READ_ONLY', 'TEACHER', 'ASSISTANT', 'PARENT'];
const ROLE_BADGE = {
  SUPER_ADMIN: 'badge-blue',
  DEVELOPER: 'badge-blue',
  ADMIN: 'badge-blue',
  PHYSICAL_TRAINER: 'badge-green',
  RECEPTION: 'badge-green',
  READ_ONLY: 'badge-yellow',
  TEACHER: 'badge-gray',
  ASSISTANT: 'badge-gray',
  PARENT: 'badge-gray',
};
// Dónde se gestiona cada rol que no es personal (para orientar al admin).
const MANAGED_AT = {
  TEACHER: 'Profesores',
  ASSISTANT: 'Asistentes',
  PARENT: 'Inscripciones',
  ADMIN: null,
};

export default function UsersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuper = ['ADMIN', 'SUPER_ADMIN', 'DEVELOPER'].includes(user?.role);
  const creatableRoles = isSuper ? [...BASIC_ROLES, ...ELEVATED_ROLES] : BASIC_ROLES;
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

  function loadUsers() {
    return api.get('/users', { scope: 'all' }).then(setUsers);
  }

  useEffect(() => {
    loadUsers().finally(() => setLoading(false));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/users', form);
      await loadUsers();
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
      await api.put(`/users/${u.id}`, { active: !u.active });
      await loadUsers();
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

  // Agrupar por rol en el orden definido.
  const byRole = ROLE_ORDER
    .map((role) => ({ role, list: users.filter((u) => u.role === role) }))
    .filter((g) => g.list.length > 0);

  const total = users.length;
  const activos = users.filter((u) => u.active).length;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Usuarios y roles</h1>
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
          Vista unificada de todas las cuentas ({activos} activas de {total}). Aquí se crean cuentas de
          <strong> Coordinador</strong>, <strong>Recepción</strong> y <strong>Solo lectura</strong>
          {isSuper ? ', y también Administrador, Super Admin y Desarrollador' : ''}.
          Profesores, asistentes y acudientes se ven aquí pero se gestionan en sus propias secciones.
        </p>

        {showForm && (
          <div className="card mb-4">
            <h3 className="mb-3">Nuevo usuario de personal</h3>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Rol *</label>
                <select className="form-input form-select" value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {creatableRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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

        {byRole.map(({ role, list }) => (
          <div key={role} className="mb-4">
            <h3 className="mb-2" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {roleLabel(role)} · {list.length}
            </h3>
            {list.map((u) => (
              <div key={u.id} className="card mb-2">
                <div className="flex items-center justify-between" style={{ gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="font-medium" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.name ? `${u.name} · ` : ''}{u.email}
                    </div>
                    <div className="text-xs text-gray" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span className={`badge ${ROLE_BADGE[u.role] || 'badge-gray'}`}>{roleLabel(u.role)}</span>
                      {!u.active && <span className="badge badge-red">Inactivo</span>}
                      {!u.manageable && MANAGED_AT[u.role] && (
                        <span>Se gestiona en «{MANAGED_AT[u.role]}»</span>
                      )}
                    </div>
                  </div>
                  {u.manageable && (
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
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
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
