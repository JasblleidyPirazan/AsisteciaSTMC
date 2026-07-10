import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { roleLabel } from '../utils/roles';

// Navegación de la barra lateral. Cada item declara los roles que lo ven.
// `section` agrupa visualmente (encabezado gris dentro del sidebar).
const NAV = [
  { section: 'Principal' },
  { label: 'Inicio', path: '/', icon: '🏠', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Panel', path: '/admin', icon: '📊', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Mi quincena', path: '/my-payroll', icon: '💵', roles: ['TEACHER', 'ASSISTANT'] },
  { label: 'Portal', path: '/parent', icon: '👨‍👩‍👧', roles: ['PARENT'] },

  { section: 'Operación' },
  { label: 'Tomar lista', path: '/tomar-lista', icon: '📋', roles: ['ADMIN', 'TEACHER', 'PHYSICAL_TRAINER', 'ASSISTANT'] },
  { label: 'Estudiantes', path: '/admin/students', icon: '👤', roles: ['ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'] },
  { label: 'Grupos', path: '/admin/groups', icon: '🎾', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Reposiciones', path: '/admin/makeups', icon: '🔁', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Festivales', path: '/admin/festivals', icon: '🎉', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Eventos', path: '/admin/events', icon: '🏆', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },

  { section: 'Seguimiento', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Reportes', path: '/admin/reports', icon: '📈', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Validación', path: '/admin/validation', icon: '✅', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Alertas', path: '/admin/alerts', icon: '🚨', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },

  { section: 'Administración', roles: ['ADMIN'] },
  { label: 'Profesores', path: '/admin/professors', icon: '🏫', roles: ['ADMIN'] },
  { label: 'Asistentes', path: '/admin/assistants', icon: '🤝', roles: ['ADMIN'] },
  { label: 'Usuarios y roles', path: '/admin/users', icon: '🔑', roles: ['ADMIN'] },
  { label: 'Liquidación', path: '/admin/payroll', icon: '💰', roles: ['ADMIN'] },
  { label: 'Inscripciones', path: '/admin/enrollment', icon: '📋', roles: ['ADMIN'] },
  { label: 'Configuración', path: '/admin/config', icon: '⚙️', roles: ['ADMIN'] },
];

function isActive(itemPath, pathname) {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(itemPath + '/');
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const role = user?.role;

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
    if (!entry.roles.includes(role)) continue;
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
