import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

function getCurrentPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const half = now.getDate() <= 15 ? '1' : '2';
  return `${y}-${m}-${half}`;
}

const SECTIONS = [
  { label: 'Estudiantes', path: '/admin/students', icon: '👤' },
  { label: 'Grupos', path: '/admin/groups', icon: '🎾' },
  { label: 'Profesores', path: '/admin/professors', icon: '🏫' },
  { label: 'Asistentes', path: '/admin/assistants', icon: '🤝' },
  { label: 'Eventos', path: '/admin/events', icon: '🏆' },
  { label: 'Liquidación', path: '/admin/payroll', icon: '💰' },
  { label: 'Inscripciones', path: '/admin/enrollment', icon: '📋' },
  { label: 'Reportes', path: '/admin/reports', icon: '📊' },
  { label: 'Configuración', path: '/admin/config', icon: '⚙️' },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const period = getCurrentPeriod();

  useEffect(() => {
    api.get('/reports/dashboard').then(setStats).catch(() => {});
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/')}>←</button>
        <h1>Administración</h1>
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
            <div className="card mb-4">
              <div className="cost-row">
                <span>Total a pagar (mes)</span>
                <span className="cost-total">{fmt(stats.totalPayableThisMonth)}</span>
              </div>
            </div>
          </>
        )}

        <h2 className="mb-3">Módulos</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {SECTIONS.map((s) => (
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
