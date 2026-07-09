import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

const TITLES = { ADMIN: 'Administración', PHYSICAL_TRAINER: 'Coordinación', RECEPTION: 'Recepción' };

// Items del bloque "Requiere atención". Cada uno se muestra solo si tiene
// pendientes (> 0) y si el rol lo puede atender.
const ATTENTION = [
  { key: 'reports', label: 'Clases sin reportar', icon: '⚠️', to: '/', accent: 'var(--red)', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { key: 'enrollments', label: 'Inscripciones por aprobar', icon: '📋', to: '/admin/enrollment', accent: 'var(--warning)', roles: ['ADMIN'] },
  { key: 'makeups', label: 'Reposiciones pendientes', icon: '🔁', to: '/admin/makeups', accent: 'var(--blue)', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
  { key: 'festivals', label: 'Festivales pendientes', icon: '🎉', to: '/admin/festivals', accent: 'var(--green)', roles: ['ADMIN', 'PHYSICAL_TRAINER'] },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState({});
  const role = user?.role;
  const isAdmin = role === 'ADMIN';

  useEffect(() => {
    api.get('/reports/dashboard').then(setStats).catch(() => {});

    const jobs = [];
    if (['ADMIN', 'PHYSICAL_TRAINER'].includes(role)) {
      jobs.push(api.get('/alerts/pending-reports').then((d) => ['reports', d?.totalPending || 0]).catch(() => ['reports', 0]));
      jobs.push(api.get('/makeups', { status: 'PROGRAMADA' }).then((d) => ['makeups', (d || []).length]).catch(() => ['makeups', 0]));
      jobs.push(api.get('/festivals', { status: 'PROGRAMADA' }).then((d) => ['festivals', (d || []).length]).catch(() => ['festivals', 0]));
    }
    if (isAdmin) {
      jobs.push(api.get('/enrollment/requests', { status: 'PENDING' }).then((d) => ['enrollments', (d || []).length]).catch(() => ['enrollments', 0]));
    }
    Promise.all(jobs).then((entries) => setPending(Object.fromEntries(entries)));
  }, [role, isAdmin]);

  const attentionItems = ATTENTION
    .filter((a) => a.roles.includes(role) && (pending[a.key] || 0) > 0);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{TITLES[role] || 'Gestión'}</h1>
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

        <h2 className="mb-3">Requiere atención</h2>
        {attentionItems.length === 0 ? (
          <div className="alert alert-success">✅ Todo al día — no hay pendientes.</div>
        ) : (
          attentionItems.map((a) => (
            <div
              key={a.key}
              className="card card-tap mb-2"
              style={{ borderLeft: `3px solid ${a.accent}` }}
              onClick={() => navigate(a.to)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: '1.3rem' }}>{a.icon}</span>
                  <span className="font-medium">{a.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-blue">{pending[a.key]}</span>
                  <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>›</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
