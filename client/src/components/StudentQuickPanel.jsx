import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { fmtDate } from '../utils/dates';

const BALL_COLOR = { Roja: '#E8526A', Naranja: '#EA8A2E', Verde: '#1FA971', Amarilla: '#E8A23B' };
const STATUS_BADGE = {
  MATRICULADO: { cls: 'badge-green', label: 'Matriculado' },
  INSCRITO: { cls: 'badge-yellow', label: 'Inscrito' },
  SUSPENDIDO: { cls: 'badge-gray', label: 'Suspendido' },
  INACTIVO: { cls: 'badge-red', label: 'Inactivo' },
};
const AVATAR_COLORS = ['#3F52A8', '#4F9FB2', '#7A5AF8', '#E8A23B', '#1FA971', '#E8526A', '#6F7BA6'];
function initials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·';
}
function colorFor(str) {
  let h = 0;
  for (const c of String(str || '')) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

// Panel lateral (drawer) con la ficha RESUMIDA de un estudiante: contacto y
// asistencia, sin salir de la vista que lo abrió. "Ver ficha completa" navega
// a Estudiantes (con volver contextual vía `from`).
export default function StudentQuickPanel({ studentId, onClose, from }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    setLoading(true); setError(''); setData(null);
    api.get(`/students/${studentId}/report`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (!studentId) return null;

  const st = data?.student;
  const sum = data?.summary;
  const g = st?.enrollments?.find((e) => e.enrollmentType === 'PRIMARY')?.group || st?.enrollments?.[0]?.group;
  const wa = String(st?.phone || '').replace(/\D/g, '');
  const rate = sum?.attendanceRate;

  return (
    <div className="quick-drawer-overlay" onClick={onClose}>
      <div className="quick-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3>Ficha rápida</h3>
          <button className="btn btn-ghost" style={{ minHeight: 32, padding: '0 8px' }} onClick={onClose}>✕</button>
        </div>

        {loading ? <div className="spinner" /> : error ? (
          <div className="alert alert-error">{error}</div>
        ) : !st ? null : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="avatar" style={{ width: 48, height: 48, background: colorFor(st.name) }}>{initials(st.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  <span className="font-medium">{st.name}</span>
                  {STATUS_BADGE[st.studentStatus] && <span className={`badge ${STATUS_BADGE[st.studentStatus].cls}`}>{STATUS_BADGE[st.studentStatus].label}</span>}
                  {st.isTrial && <span className="badge badge-yellow">🧪 Prueba</span>}
                </div>
                <div className="text-xs text-gray mt-1" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {g?.ballLevel && <span><span className="legend-dot" style={{ background: BALL_COLOR[g.ballLevel] || 'var(--gray-400)' }} />{g.ballLevel}{g.subLevel ? ` ${g.subLevel}` : ''}</span>}
                  {g?.code && <span>· {g.code}</span>}
                  {g?.professor?.name && <span>· {g.professor.name}</span>}
                </div>
              </div>
            </div>

            {/* Contacto */}
            <div className="text-sm text-gray mb-1">
              {st.guardianName && <>Acudiente: <strong>{st.guardianName}</strong></>}
              {st.phone && <> · 📞 {st.phone}</>}
            </div>
            <div className="flex gap-2 mb-3">
              {wa && <a className="btn btn-success" style={{ flex: 1 }} href={`https://wa.me/57${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>}
              {st.email && <a className="btn btn-outline" style={{ flex: 1 }} href={`mailto:${st.email}`}>Correo</a>}
            </div>

            {/* Asistencia */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }} className="mb-3">
              <div className="stat-box"><div className="num" style={{ color: rate != null && rate < 75 ? 'var(--red)' : 'var(--green)' }}>{rate != null ? `${rate}%` : '—'}</div><div className="lbl">Asistencia · {sum.classesSeen} vistas</div></div>
              <div className="stat-box"><div className="num" style={{ color: 'var(--red)' }}>{sum.absent}</div><div className="lbl">Faltas</div></div>
              <div className="stat-box"><div className="num">{sum.classesAcquired}</div><div className="lbl">Adquiridas</div></div>
              <div className="stat-box"><div className="num" style={{ color: 'var(--blue)' }}>{sum.cancelledRain}</div><div className="lbl">Canceladas · lluvia</div></div>
            </div>

            {/* Últimas clases */}
            {data.timeline?.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray mb-1" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Últimas clases</div>
                {data.timeline.slice(0, 5).map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-sm" style={{ padding: '3px 0' }}>
                    <span className="text-gray">{fmtDate(t.date, { day: 'numeric', month: 'short' })} · {t.groupCode}</span>
                    <span className="font-medium">{t.studentStatus || '—'}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="btn btn-primary btn-full"
              onClick={() => navigate('/admin/students', { state: { focusStudentId: st.id, ...(from ? { from } : {}) } })}>
              Ver ficha completa →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
