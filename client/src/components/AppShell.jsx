import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { roleLabel } from '../utils/roles';

// Navegación de la barra lateral. Cada item declara su `module`: se muestra solo
// si el rol tiene permiso de "ver" ese módulo en la matriz de accesos. Los ítems
// del bloque "Principal" (puntos de entrada por rol) llevan además `roles` para
// distinguir la variante correcta (Inicio de admin vs Portal del acudiente).
const NAV = [
  { section: 'Principal' },
  { label: 'Inicio', path: '/', icon: '🏠', module: 'tablero', roles: ['ADMIN', 'PHYSICAL_TRAINER', 'SUPER_ADMIN', 'DEVELOPER', 'READ_ONLY'] },
  { label: 'Panel', path: '/admin', icon: '📊', module: 'tablero', roles: ['ADMIN', 'PHYSICAL_TRAINER', 'SUPER_ADMIN', 'DEVELOPER', 'READ_ONLY'] },
  { label: 'Mi quincena', path: '/my-payroll', icon: '💵', module: 'nomina', roles: ['TEACHER', 'ASSISTANT'] },
  { label: 'Portal', path: '/parent', icon: '👨‍👩‍👧', module: 'tablero', roles: ['PARENT'] },

  { section: 'Operación' },
  { label: 'Tomar lista', path: '/tomar-lista', icon: '📋', module: 'pasar_lista', roles: ['ADMIN', 'TEACHER', 'PHYSICAL_TRAINER', 'ASSISTANT', 'SUPER_ADMIN', 'DEVELOPER', 'READ_ONLY'] },
  { label: 'Estudiantes', path: '/admin/students', icon: '👤', module: 'estudiantes' },
  { label: 'Grupos', path: '/admin/groups', icon: '🎾', module: 'grupos' },
  { label: 'Horarios', path: '/admin/horarios', icon: '🗓️', module: 'horarios' },
  { label: 'Reposiciones', path: '/admin/makeups', icon: '🔁', module: 'reposiciones' },
  { label: 'Festivales', path: '/admin/festivals', icon: '🎉', module: 'festivales' },
  { label: 'Eventos', path: '/admin/events', icon: '🏆', module: 'festivales' },

  { section: 'Seguimiento' },
  { label: 'Reportes', path: '/admin/reports', icon: '📈', module: 'informes' },
  { label: 'Asistencia', path: '/admin/asistencia', icon: '🧾', module: 'asistencia', roles: ['ADMIN', 'PHYSICAL_TRAINER', 'SUPER_ADMIN', 'DEVELOPER', 'READ_ONLY'] },
  { label: 'Validación', path: '/admin/validation', icon: '✅', module: 'revisiones' },
  { label: 'Alertas', path: '/admin/alerts', icon: '🚨', module: 'informes' },

  { section: 'Administración' },
  { label: 'Profesores', path: '/admin/professors', icon: '🏫', module: 'roles_accesos' },
  { label: 'Asistentes', path: '/admin/assistants', icon: '🤝', module: 'roles_accesos' },
  { label: 'Usuarios y roles', path: '/admin/users', icon: '🔑', module: 'roles_accesos' },
  { label: 'Roles y accesos', path: '/admin/roles', icon: '🛡️', module: 'roles_accesos' },
  { label: 'Liquidación', path: '/admin/payroll', icon: '💰', module: 'nomina', roles: ['ADMIN', 'SUPER_ADMIN', 'DEVELOPER', 'READ_ONLY'] },
  { label: 'Inscripciones', path: '/admin/enrollment', icon: '📋', module: 'estudiantes', roles: ['ADMIN', 'SUPER_ADMIN', 'DEVELOPER', 'READ_ONLY'] },
  { label: 'Configuración', path: '/admin/config', icon: '⚙️', module: 'configuracion' },
  { label: 'Auditoría', path: '/admin/auditoria', icon: '🕵️', module: 'auditoria' },
];

function isActive(itemPath, pathname) {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(itemPath + '/');
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const role = user?.role;

  // Cerrar el drawer al navegar (móvil).
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Construir la navegación visible: cada item requiere permiso de "ver" su
  // módulo; los que traen `roles` además deben coincidir con el rol actual.
  const items = [];
  let pendingSection = null;
  for (const entry of NAV) {
    if (entry.section) {
      pendingSection = entry;
      continue;
    }
    const visible = can(entry.module, 'view') && (!entry.roles || entry.roles.includes(role));
    if (!visible) continue;
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
          <button className="app-shell-logout" onClick={logout}>
            <span>⎋</span> Cerrar sesión
          </button>
        </div>
      </aside>

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
