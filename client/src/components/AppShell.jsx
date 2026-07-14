import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { roleLabel } from '../utils/roles';
import { api } from '../api/client';

// Navegación de la barra lateral. Cada item declara los roles que lo ven.
// `section` agrupa visualmente (encabezado gris dentro del sidebar).
const NAV = [
  { section: 'Principal' },
  { label: 'Inicio', path: '/', icon: '🏠', roles: ['ADMIN', 'TEACHER', 'PHYSICAL_TRAINER', 'ASSISTANT'] },
  // Panel de bienvenida (/admin). El ADMIN llega solo (su Inicio redirige),
  // pero Coordinador y Superadmin entran a "Grupos del día", así que
  // necesitan este acceso directo.
  { label: 'Panel de gestión', path: '/admin', icon: '🧭', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Mi quincena', path: '/my-payroll', icon: '💵', roles: ['TEACHER', 'ASSISTANT'] },
  { label: 'Clases dadas', path: '/reporte', icon: '📋', roles: ['TEACHER', 'ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Horarios', path: '/horarios', icon: '🗓️', roles: ['ADMIN', 'TEACHER', 'PHYSICAL_TRAINER', 'ASSISTANT', 'RECEPTION', 'PARENT'] },
  { label: 'Portal', path: '/parent', icon: '👨‍👩‍👧', roles: ['PARENT'] },

  { section: 'Operación', roles: ['ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'] },
  { label: 'Estudiantes', path: '/admin/students', icon: '👤', roles: ['ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'] },
  { label: 'Validación de datos', path: '/admin/enrollment', icon: '📝', roles: ['ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'] },
  { label: 'Grupos', path: '/admin/groups', icon: '🎾', roles: ['ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'] },
  { label: 'Reposiciones', path: '/admin/makeups', icon: '🔁', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Festivales', path: '/admin/festivals', icon: '🎉', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Eventos', path: '/admin/events', icon: '🏆', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },

  { section: 'Seguimiento', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Reportes', path: '/admin/reports', icon: '📈', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Validación', path: '/admin/validation', icon: '✅', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Conflictos', path: '/admin/conflicts', icon: '⚖️', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Alertas', path: '/admin/alerts', icon: '🚨', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },

  { section: 'Administración', roles: ['ADMIN'] },
  { label: 'Profesores', path: '/admin/professors', icon: '🏫', roles: ['ADMIN'] },
  { label: 'Asistentes', path: '/admin/assistants', icon: '🤝', roles: ['ADMIN'] },
  { label: 'Usuarios y roles', path: '/admin/users', icon: '🔑', roles: ['ADMIN'] },
  { label: 'Liquidación', path: '/admin/payroll', icon: '💰', roles: ['ADMIN'] },
  { label: 'Contabilidad', path: '/admin/accounting', icon: '📊', roles: ['ADMIN'] },
  { label: 'Visión estratégica', path: '/admin/strategy', icon: '🎯', roles: ['ADMIN'] },
  { label: 'Auditoría', path: '/admin/audit', icon: '🕵️', roles: ['ADMIN'] },
  { label: 'Configuración', path: '/admin/config', icon: '⚙️', roles: ['ADMIN'] },
];

function isActive(itemPath, pathname) {
  if (itemPath === '/') return pathname === '/';
  // '/admin' es el panel de bienvenida; sin coincidencia exacta quedaría
  // resaltado en todas las subpáginas /admin/*.
  if (itemPath === '/admin') return pathname === '/admin';
  return pathname === itemPath || pathname.startsWith(itemPath + '/');
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const role = user?.role;

  // Cambio de contraseña (disponible para cualquier usuario).
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError(''); setPwMsg('');
    if (pwForm.next.length < 8) { setPwError('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Las contraseñas no coinciden'); return; }
    setPwSaving(true);
    try {
      await api.put('/auth/password', { currentPassword: pwForm.current, newPassword: pwForm.next });
      setPwMsg('✓ Contraseña actualizada');
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => { setPwOpen(false); setPwMsg(''); }, 1500);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
    }
  }

  // Cerrar el drawer al navegar (móvil).
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Construir la navegación visible según rol, ocultando secciones vacías.
  const items = [];
  let pendingSection = null;
  for (const entry of NAV) {
    if (entry.section) {
      pendingSection = entry;
      continue;
    }
    // SUPERADMIN is the superset of ADMIN — it sees every nav item.
    if (role !== 'SUPERADMIN' && !entry.roles.includes(role)) continue;
    if (pendingSection) {
      items.push({ isSection: true, label: pendingSection.section });
      pendingSection = null;
    }
    items.push(entry);
  }

  const go = (path) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <div className="app-shell">
      {open && <div className="app-shell-backdrop" onClick={() => setOpen(false)} />}

      <aside className={`app-shell-sidebar${open ? ' open' : ''}`}>
        <div className="app-shell-brand">
          <div className="app-shell-brand-card">
            <span className="logo-emoji">🎾</span>
            <span className="logo-text">STMC</span>
          </div>
        </div>

        <nav className="app-shell-nav">
          {items.map((it, i) =>
            it.isSection ? (
              <div key={`s-${i}`} className="nav-section">{it.label}</div>
            ) : (
              <button
                key={it.path}
                className={`nav-item${isActive(it.path, location.pathname) ? ' active' : ''}`}
                onClick={() => go(it.path)}
              >
                <span className="nav-ico">{it.icon}</span>
                <span>{it.label}</span>
              </button>
            )
          )}
        </nav>

        <div className="app-shell-foot">
          <div className="app-shell-user">{user?.email}</div>
          <button className="app-shell-logout" style={{ marginBottom: 8 }}
            onClick={() => { setPwOpen(true); setPwError(''); setPwMsg(''); setPwForm({ current: '', next: '', confirm: '' }); }}>
            <span>🔑</span> Cambiar contraseña
          </button>
          <button className="app-shell-logout" onClick={logout}>
            <span>⎋</span> Cerrar sesión
          </button>
        </div>
      </aside>

      {pwOpen && (
        <div className="modal-overlay" onClick={() => setPwOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 className="mb-3">Cambiar contraseña</h3>
            {pwError && <div className="alert alert-error mb-2">{pwError}</div>}
            {pwMsg && <div className="alert alert-success mb-2">{pwMsg}</div>}
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Contraseña actual</label>
                <input type="password" className="form-input" required autoFocus value={pwForm.current}
                  onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Nueva contraseña (mín. 8)</label>
                <input type="password" className="form-input" required minLength={8} maxLength={128} value={pwForm.next}
                  onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Repite la nueva contraseña</label>
                <input type="password" className="form-input" required value={pwForm.confirm}
                  onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setPwOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={pwSaving}>
                  {pwSaving ? 'Guardando…' : 'Actualizar contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="app-shell-main">
        <div className="app-shell-topbar">
          <button
            className="app-shell-hamburger"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="topbar-brand">🎾 STMC</span>
          <span className="topbar-role">{roleLabel(role)}</span>
        </div>
        <div className="app-shell-content">{children}</div>
      </div>
    </div>
  );
}
