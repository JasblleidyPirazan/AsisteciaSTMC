import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

const LEVEL_BADGE = {
  ROJA: { cls: 'badge-red', label: 'Roja' },
  AMARILLA: { cls: 'badge-yellow', label: 'Amarilla' },
};

export default function AlertsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('individual');
  const [attendance, setAttendance] = useState(null);
  const [rain, setRain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlyAlerts, setOnlyAlerts] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/alerts/attendance'),
      api.get('/alerts/rain'),
    ]).then(([a, r]) => {
      setAttendance(a);
      setRain(r);
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const students = (attendance?.students || []).filter((s) => !onlyAlerts || s.level);
  const rainGroups = rain?.groups || [];

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Alertas</h1>
      </div>

      <div className="page-content">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className={`btn ${tab === 'individual' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, minHeight: 38, fontSize: '0.85rem' }}
            onClick={() => setTab('individual')}>
            Individuales {attendance?.alertCount > 0 && `(${attendance.alertCount})`}
          </button>
          <button className={`btn ${tab === 'rain' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, minHeight: 38, fontSize: '0.85rem' }}
            onClick={() => setTab('rain')}>
            Lluvia por grupo
          </button>
        </div>

        {error && <div className="alert alert-error mb-3">{error}</div>}
        {loading ? <div className="spinner" /> : tab === 'individual' ? (
          <>
            <p className="text-sm text-gray mb-2">
              Desviación respecto del nivel ideal de avance (clases esperadas a la fecha según
              el calendario del semestre). <strong>Amarilla</strong>: más de {attendance?.thresholds?.yellow ?? 2} clases ·{' '}
              <strong>Roja</strong>: más de {attendance?.thresholds?.red ?? 4} clases.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} />
              <span className="text-sm">Mostrar solo estudiantes con alerta</span>
            </label>

            {!attendance || attendance.students.length === 0 ? (
              <div className="alert alert-info">
                No hay datos — verifica que exista un semestre activo.
              </div>
            ) : students.length === 0 ? (
              <div className="alert alert-success">🎾 Ningún estudiante en alerta.</div>
            ) : (
              students.map((s) => {
                const badge = LEVEL_BADGE[s.level];
                return (
                  <div key={s.studentId} className="card mb-2"
                    style={badge ? { borderLeft: `4px solid ${s.level === 'ROJA' ? 'var(--red)' : 'var(--yellow)'}` } : undefined}>
                    <div className="flex items-center justify-between">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-gray">{s.groups.join(' · ') || 'Sin grupo'}</div>
                        <div className="text-xs text-gray">
                          Vistas {s.seen} / esperadas {s.expected} · desviación {s.deviation}
                        </div>
                      </div>
                      {badge && <span className={`badge ${badge.cls}`}>{badge.label}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-gray mb-3">
              Grupos con clases canceladas por lluvia en el semestre activo.
              Alerta al llegar a <strong>{rain?.threshold ?? 3}</strong> cancelaciones
              (configurable en Configuración).
            </p>
            {rainGroups.length === 0 ? (
              <div className="alert alert-success">🌤️ Ningún grupo con clases perdidas por lluvia.</div>
            ) : (
              rainGroups.map((g) => (
                <div key={g.groupId} className="card mb-2"
                  style={g.alert ? { borderLeft: '4px solid var(--red)' } : undefined}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{g.code}</div>
                      <div className="text-xs text-gray">{g.professor?.name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className={`badge ${g.alert ? 'badge-red' : 'badge-gray'}`}>
                        {g.rainCancelled} por lluvia
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
