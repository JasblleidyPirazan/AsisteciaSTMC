import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

const ALL_SECTIONS = [
  { label: 'Estudiantes', path: '/admin/students', icon: '👤', roles: ['ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'] },
  { label: 'Grupos', path: '/admin/groups', icon: '🎾', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Reposiciones', path: '/admin/makeups', icon: '🔁', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Festivales', path: '/admin/festivals', icon: '🎉', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Eventos', path: '/admin/events', icon: '🏆', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Reportes', path: '/admin/reports', icon: '📊', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Validación', path: '/admin/validation', icon: '✅', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Alertas', path: '/admin/alerts', icon: '🚨', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { label: 'Profesores', path: '/admin/professors', icon: '🏫', roles: ['ADMIN'] },
  { label: 'Asistentes', path: '/admin/assistants', icon: '🤝', roles: ['ADMIN'] },
  { label: 'Usuarios', path: '/admin/users', icon: '🔑', roles: ['ADMIN'] },
  { label: 'Liquidación', path: '/admin/payroll', icon: '💰', roles: ['ADMIN'] },
  { label: 'Inscripciones', path: '/admin/enrollment', icon: '📋', roles: ['ADMIN'] },
  { label: 'Configuración', path: '/admin/config', icon: '⚙️', roles: ['ADMIN'] },
];

const TITLES = { ADMIN: 'Administración', PHYSICAL_TRAINER: 'Coordinación', RECEPTION: 'Recepción' };

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const isAdmin = user?.role === 'ADMIN';

  const sections = ALL_SECTIONS.filter((s) => s.roles.includes(user?.role));

  useEffect(() => {
    api.get('/reports/dashboard').then(setStats).catch(() => {});
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/')}>←</button>
        <h1>{TITLES[user?.role] || 'Gestión'}</h1>
      </div>

      <div className="page-content">
        {stats && (
          <>
            <h2 className="mb-3">Este mes</h2>
            <div className="stats-row mb-4">
              <div className="stat-box">
                <div className="num">{stats.totalStudents}</div>
                <div className="lbl">Estudiantes</div>
              </div>
              <div className="stat-box">
                <div className="num">{stats.sessionsThisMonth}</div>
                <div className="lbl">Clases dadas</div>
              </div>
              <div className="stat-box">
                <div className="num">{stats.cancelledThisMonth}</div>
                <div className="lbl">Canceladas</div>
              </div>
            </div>
            {isAdmin && (
              <div className="card mb-4">
                <div className="cost-row">
                  <div>
                    <span>Pago de la quincena</span>
                    {stats.currentPeriod && (
                      <div className="text-xs text-gray">Periodo {stats.currentPeriod}</div>
                    )}
                  </div>
                  <span className="cost-total">{fmt(stats.totalPayableThisPeriod)}</span>
                </div>
              </div>
            )}
          </>
        )}

        <h2 className="mb-3">Módulos</h2>
        <div className="module-grid">
          {sections.map((s) => (
            <button
              key={s.path}
              className="card card-tap"
              style={{ textAlign: 'center', padding: '20px 12px', border: '1.5px solid var(--gray-200)' }}
              onClick={() => navigate(s.path)}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: 6 }}>{s.icon}</div>
              <div className="font-medium text-sm">{s.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
