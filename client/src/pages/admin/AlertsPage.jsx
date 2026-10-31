import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import StudentQuickPanel from '../../components/StudentQuickPanel';

export default function AlertsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('rain');
  const [rain, setRain] = useState(null);
  const [preinscritos, setPreinscritos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelStudentId, setPanelStudentId] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/alerts/rain'),
      api.get('/alerts/preinscritos'),
    ]).then(([r, p]) => {
      setRain(r);
      setPreinscritos(p);
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const rainGroups = rain?.groups || [];
  const preGroups = preinscritos?.groups || [];

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Alertas</h1>
      </div>

      <div className="page-content">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
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

        <div className="alert alert-info mb-3 text-sm">
          El seguimiento por estudiante (quién necesita reposición, reprogramación o cierre de reportes)
          y el calendario por grupo (festivos, lluvia, fin estimado) están en <button className="link-name" onClick={() => navigate('/admin')}>Reposiciones y reprogramación ›</button>
        </div>

        {error && <div className="alert alert-error mb-3">{error}</div>}
        {loading ? <div className="spinner" /> : tab === 'rain' ? (
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
