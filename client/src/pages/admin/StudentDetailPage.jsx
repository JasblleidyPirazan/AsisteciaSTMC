import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';

const STATUS_BADGE = { PRESENTE: 'badge-green', AUSENTE: 'badge-red', JUSTIFICADA: 'badge-yellow' };
const STATUS_LABEL = { PRESENTE: 'Presente', AUSENTE: 'Ausente', JUSTIFICADA: 'Justificada' };

export default function StudentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/reports/student/${id}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page"><div className="spinner" /></div>;

  if (error || !data) {
    return (
      <div className="page">
        <div className="page-header">
          <button className="nav-back" onClick={() => navigate('/admin/students')}>←</button>
          <h1>Estudiante</h1>
        </div>
        <div className="page-content">
          <div className="alert alert-error">{error || 'No se pudo cargar el estudiante'}</div>
        </div>
      </div>
    );
  }

  const { student, summary, records } = data;
  const kpis = [
    { label: 'Asistencias', value: summary.present, color: 'var(--green)' },
    { label: 'Ausencias', value: summary.absent, color: 'var(--red)' },
    { label: 'Por lluvia', value: summary.rainCancelled, color: 'var(--blue)' },
    { label: 'Justificadas', value: summary.justified, color: 'var(--yellow)' },
    { label: 'Avance', value: summary.avance != null ? `${summary.avance}%` : '—', color: 'var(--gray-800)' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin/students')}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '1.125rem' }}>{student?.name || 'Estudiante'}</h1>
          {student?.currentGroup && (
            <p className="text-xs text-gray">{student.currentGroup.code}</p>
          )}
        </div>
      </div>

      <div className="page-content">
        {/* Datos de inscripción */}
        <div className="card mb-3">
          <div className="flex items-center justify-between" style={{ padding: '4px 0' }}>
            <span className="text-sm text-gray">Fecha de inscripción</span>
            <span className="text-sm font-medium">{fmtDate(student?.enrolledAt)}</span>
          </div>
          <div className="flex items-center justify-between" style={{ padding: '4px 0' }}>
            <span className="text-sm text-gray">Grupo actual</span>
            <span className="text-sm font-medium">{student?.currentGroup?.code || '—'}</span>
          </div>
          <div className="flex items-center justify-between" style={{ padding: '4px 0' }}>
            <span className="text-sm text-gray">Clases matriculadas</span>
            <span className="text-sm font-medium">{student?.contractedClasses ?? '—'}</span>
          </div>
          {student?.groups?.length > 1 && (
            <div style={{ paddingTop: 6, marginTop: 6, borderTop: '1px solid var(--gray-100)' }}>
              <div className="text-xs text-gray mb-1">Todos los grupos:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {student.groups.map((g) => (
                  <span key={g.id} className="badge badge-gray">
                    {g.code} {g.enrollmentType === 'PRIMARY' ? '(Principal)' : '(Sec.)'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {kpis.map((k) => (
            <div key={k.label} className="stat-box">
              <div className="num" style={{ color: k.color, fontSize: '1.5rem' }}>{k.value}</div>
              <div className="lbl">{k.label}</div>
            </div>
          ))}
        </div>

        {summary.avance != null && (
          <div className="text-xs text-gray mb-3" style={{ textAlign: 'center' }}>
            Avance = clases efectivas ({summary.effective}) ÷ matriculadas ({summary.contractedClasses})
          </div>
        )}

        {/* Detalle de clases */}
        <h3 className="mb-2">Detalle de clases</h3>
        {records.length === 0 ? (
          <div className="alert alert-info">Sin clases registradas todavía.</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {records.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between"
                style={{
                  padding: '10px 14px',
                  borderBottom: i < records.length - 1 ? '1px solid var(--gray-100)' : 'none',
                }}>
                <div style={{ minWidth: 0 }}>
                  <div className="text-sm font-medium">{fmtDate(r.session?.date)}</div>
                  <div className="text-xs text-gray">
                    {r.session?.group?.code || '—'}
                    {r.attendanceType === 'REPOSICION' && (
                      <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: '0.6rem' }}>repo</span>
                    )}
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
