import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import StudentQuickPanel from '../../components/StudentQuickPanel';

const LEVEL_BADGE = {
  ROJA: { cls: 'badge-red', label: 'Roja' },
  AMARILLA: { cls: 'badge-yellow', label: 'Amarilla' },
};

export default function AlertsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('individual');
  const [attendance, setAttendance] = useState(null);
  const [rain, setRain] = useState(null);
  const [preinscritos, setPreinscritos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlyAlerts, setOnlyAlerts] = useState(true);
  const [error, setError] = useState('');
  const [panelStudentId, setPanelStudentId] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/alerts/attendance'),
      api.get('/alerts/rain'),
      api.get('/alerts/preinscritos'),
    ]).then(([a, r, p]) => {
      setAttendance(a);
      setRain(r);
      setPreinscritos(p);
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const students = (attendance?.students || []).filter((s) => !onlyAlerts || s.level);
  const rainGroups = rain?.groups || [];
  const preGroups = preinscritos?.groups || [];

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
          <button className={`btn ${tab === 'pre' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, minHeight: 38, fontSize: '0.85rem' }}
            onClick={() => setTab('pre')}>
            Preinscritos {preinscritos?.alertCount > 0 && `(${preinscritos.alertCount})`}
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
                  <div key={s.studentId} className="card card-tap mb-2"
                    style={badge ? { borderLeft: `4px solid ${s.level === 'ROJA' ? 'var(--red)' : 'var(--yellow)'}` } : undefined}
                    onClick={() => setPanelStudentId(s.studentId)}
                    title="Ver ficha rápida">
                    <div className="flex items-center justify-between">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-medium">{s.name} <span className="text-xs text-gray" style={{ fontWeight: 400 }}>›</span></div>
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
        ) : tab === 'rain' ? (
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
                <div key={g.groupId} className="card card-tap mb-2"
                  style={g.alert ? { borderLeft: '4px solid var(--red)' } : undefined}
                  onClick={() => navigate('/admin/groups', { state: { focusCode: g.code, from: { label: 'Alertas', to: '/admin/alerts' } } })}
                  title="Ver grupo">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{g.code} <span className="text-xs text-gray" style={{ fontWeight: 400 }}>›</span></div>
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
        ) : (
          <>
            <p className="text-sm text-gray mb-3">
              Grupos con estudiantes <strong>📝 preinscritos</strong> (registrados, aún sin pagos ni
              asistencia). Alerta al llegar a <strong>{preinscritos?.threshold ?? 2}</strong> o más en un grupo.
            </p>
            {preGroups.length === 0 ? (
              <div className="alert alert-success">🎾 Ningún grupo con estudiantes preinscritos.</div>
            ) : (
              preGroups.map((g) => (
                <div key={g.groupId} className="card mb-2"
                  style={g.alert ? { borderLeft: '4px solid var(--yellow)' } : undefined}>
                  <div className="flex items-center justify-between">
                    <div>
                      <button className="link-name font-medium"
                        onClick={() => navigate('/admin/groups', { state: { focusCode: g.code, from: { label: 'Alertas', to: '/admin/alerts' } } })}
                        title="Ver grupo">
                        {g.code} ›
                      </button>
                      <div className="text-xs text-gray">{g.professor?.name}</div>
                    </div>
                    <span className={`badge ${g.alert ? 'badge-yellow' : 'badge-gray'}`}>
                      📝 {g.preinscritos} preinscrito{g.preinscritos !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
                    {g.students.map((s) => (
                      <button key={s.id} className="btn btn-ghost"
                        style={{ minHeight: 28, fontSize: '0.75rem', padding: '0 8px' }}
                        onClick={() => setPanelStudentId(s.id)} title="Ver ficha rápida">
                        {s.name} ›
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {panelStudentId && (
        <StudentQuickPanel
          studentId={panelStudentId}
          onClose={() => setPanelStudentId(null)}
          from={{ label: 'Alertas', to: '/admin/alerts' }}
        />
      )}
    </div>
  );
}
