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

  // Edit modal
  const [editTarget, setEditTarget] = useState(null); // professor object
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '' });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    // active:'false' = todos (activos e inactivos); los desactivados se
    // muestran en su propia sección para poder editarlos o reactivarlos.
    api.get('/professors', { active: 'false' })
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

  function openEdit(p) {
    setEditTarget(p);
    setEditForm({ name: p.name, email: p.user?.email || '', password: '' });
    setEditError('');
  }

  async function handleEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    setEditError('');
    try {
      const payload = { name: editForm.name };
      // Only send account fields when the admin actually changed them
      if (editForm.email && editForm.email !== (editTarget.user?.email || '')) {
        payload.email = editForm.email;
      }
      if (editForm.password) payload.password = editForm.password;
      const updated = await api.put(`/professors/${editTarget.id}`, payload);
      setProfessors(professors.map((p) => (p.id === editTarget.id ? { ...p, ...updated } : p)));
      setEditTarget(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeactivate(id) {
    if (!confirm('¿Desactivar profesor?')) return;
    const updated = await api.put(`/professors/${id}`, { active: false });
    setProfessors(professors.map((p) => (p.id === id ? { ...p, ...updated } : p)));
  }

  async function handleReactivate(id) {
    const updated = await api.put(`/professors/${id}`, { active: true });
    setProfessors(professors.map((p) => (p.id === id ? { ...p, ...updated } : p)));
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  const activeProfessors = professors.filter((p) => p.active);
  const inactiveProfessors = professors.filter((p) => !p.active);

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

        {activeProfessors.length === 0 ? (
          <div className="alert alert-info">No hay profesores activos.</div>
        ) : (
          activeProfessors.map((p) => (
            <div key={p.id} className="card mb-2">
              <div className="flex items-center justify-between">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="font-medium">{p.name}</div>
                  {p.user?.email ? (
                    <div className="text-xs text-gray">{p.user.email}</div>
                  ) : (
                    <div className="text-xs" style={{ color: 'var(--yellow)' }}>Sin cuenta de acceso</div>
                  )}
                  {p.groups?.length > 0 && (
                    <div className="text-xs text-gray">
                      {p.groups.map((g) => g.code).join(' · ')}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ minHeight: 32, padding: '0 8px', fontSize: '0.8rem' }}
                    onClick={() => openEdit(p)}
                  >
                    Editar
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ minHeight: 32, padding: '0 8px', fontSize: '0.8rem', color: 'var(--red)' }}
                    onClick={() => handleDeactivate(p.id)}
                  >
                    Desactivar
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Profesores desactivados: visibles para poder editarlos o reactivarlos */}
        {inactiveProfessors.length > 0 && (
          <>
            <h3 className="mb-2 mt-4" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Desactivados · {inactiveProfessors.length}
            </h3>
            {inactiveProfessors.map((p) => (
              <div key={p.id} className="card mb-2" style={{ opacity: 0.75 }}>
                <div className="flex items-center justify-between">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="font-medium">
                      {p.name} <span className="badge badge-gray" style={{ marginLeft: 6 }}>Inactivo</span>
                    </div>
                    {p.user?.email && <div className="text-xs text-gray">{p.user.email}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ minHeight: 32, padding: '0 8px', fontSize: '0.8rem' }}
                      onClick={() => openEdit(p)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ minHeight: 32, padding: '0 8px', fontSize: '0.8rem', color: 'var(--green)' }}
                      onClick={() => handleReactivate(p.id)}
                    >
                      Reactivar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Edit modal */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3">Editar profesor</h3>
            {editError && <div className="alert alert-error">{editError}</div>}
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input type="text" className="form-input" required maxLength={200}
                  value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>

              <div className="divider" />
              <div className="text-sm font-medium mb-2">
                {editTarget.user?.email ? 'Cuenta de acceso' : 'Crear cuenta de acceso'}
              </div>

              <div className="form-group">
                <label className="form-label">Correo electrónico</label>
                <input type="email" className="form-input" maxLength={254}
                  placeholder="profesor@correo.com"
                  value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  {editTarget.user?.email ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
                </label>
                <input type="password" className="form-input" minLength={8} maxLength={128}
                  placeholder={editTarget.user?.email ? 'Dejar vacío para no cambiar' : 'Mín. 8 caracteres'}
                  value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
                <span className="text-xs text-gray">
                  {editTarget.user?.email
                    ? 'Solo cámbiala si quieres restablecer el acceso.'
                    : 'Escribe correo y contraseña para habilitar el acceso del profesor.'}
                </span>
              </div>

              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setEditTarget(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={editSaving}>
                  {editSaving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
