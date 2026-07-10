import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { usePermissions } from '../../hooks/usePermissions';
import { roleLabel } from '../../utils/roles';

// Roles con acceso total (no editables) y guardrail anti-lockout.
const FULL_ACCESS = ['SUPER_ADMIN', 'DEVELOPER'];

export default function RolesAccesosPage() {
  const navigate = useNavigate();
  const { matrix, modules, roles, loading, refetch } = usePermissions();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (matrix) setDraft(JSON.parse(JSON.stringify(matrix)));
  }, [matrix]);

  // Bloqueado = no editable en la UI (acceso total, o anti-lockout de roles_accesos).
  function locked(role, moduleKey) {
    if (FULL_ACCESS.includes(role)) return true;
    if (moduleKey === 'roles_accesos' && role === 'ADMIN') return true;
    return false;
  }

  function toggle(role, moduleKey, action) {
    if (locked(role, moduleKey)) return;
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const cell = next[role][moduleKey];
      cell[action] = !cell[action];
      // Si apago "Ver", también apago "Editar" (no se puede editar lo que no se ve).
      if (action === 'view' && !cell.view) cell.edit = false;
      if (action === 'edit' && cell.edit) cell.view = true;
      return next;
    });
  }

  async function handleSave() {
    setSaving(true); setMsg('');
    try {
      await api.put('/permissions', { matrix: draft });
      await refetch();
      setMsg('Cambios guardados.');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !draft || !modules || !roles) {
    return <div className="page"><div className="spinner" /></div>;
  }

  function Cell({ role, mod }) {
    const cell = draft[role]?.[mod.key] || { view: false, edit: false };
    const lock = locked(role, mod.key);
    const eff = FULL_ACCESS.includes(role); // acceso total efectivo
    return (
      <td className="num" style={{ whiteSpace: 'nowrap' }}>
        <label title="Ver" style={{ marginRight: 8, cursor: lock ? 'default' : 'pointer', opacity: lock ? 0.6 : 1 }}>
          <input type="checkbox" checked={eff || cell.view} disabled={lock}
            onChange={() => toggle(role, mod.key, 'view')} /> <span className="text-xs">V</span>
        </label>
        {mod.edit ? (
          <label title="Editar" style={{ cursor: lock ? 'default' : 'pointer', opacity: lock ? 0.6 : 1 }}>
            <input type="checkbox" checked={eff || cell.edit} disabled={lock}
              onChange={() => toggle(role, mod.key, 'edit')} /> <span className="text-xs">E</span>
          </label>
        ) : <span className="text-xs text-gray">—</span>}
      </td>
    );
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Roles y accesos</h1>
        <button className="btn btn-primary" style={{ marginLeft: 'auto', minHeight: 36, padding: '0 14px', fontSize: '0.875rem' }}
          onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      <div className="page-content">
        <p className="text-sm text-gray mb-2">
          Define, por rol, qué puede <strong>Ver</strong> (V) y qué puede <strong>Editar</strong> (E).
          Apagar «Ver» oculta el módulo del menú y bloquea su acceso. Super Admin y Desarrollador
          tienen acceso total.
        </p>
        {msg && <div className="alert alert-success">{msg}</div>}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Módulo</th>
                {roles.map((r) => <th key={r} className="num">{roleLabel(r)}</th>)}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <tr key={mod.key}>
                  <td className="font-medium">{mod.label}</td>
                  {roles.map((r) => <Cell key={r} role={r} mod={mod} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
