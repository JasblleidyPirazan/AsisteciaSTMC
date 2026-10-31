import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { fmtDate } from '../utils/dates';

const n = (v) => Number(v || 0).toLocaleString('es-CO');
const plural = (v, one, many) => `${n(v)} ${Number(v) === 1 ? one : many}`;

// Panel de Gestión: ¿estamos dando las clases que los estudiantes pagaron?
// Arriba el cumplimiento del semestre y de dónde saldrá lo que falta; abajo los
// estudiantes que requieren atención. Dos conceptos separados:
//  - Clases de REPOSICIÓN (lluvia + justificadas): la Escuela las programa.
//  - Clases por RECUPERAR POR CALENDARIO (festivos y recesos): no se reponen,
//    el calendario regular se corre y las devuelve si alcanza antes del cierre.
export default function CoordinatorStudentsPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState({ shortfall: true, makeups: false, nearEnd: false });

  useEffect(() => {
    if (!['ADMIN', 'PHYSICAL_TRAINER', 'SUPERADMIN'].includes(user?.role)) return;
    api.get('/alerts/coordinator').then(setData).catch(() => setError(true));
  }, [user?.role]);

  if (error) return <div className="alert alert-error mb-4">No se pudo cargar el cumplimiento del semestre.</div>;
  if (!data) return null;
  const { summary: s, makeups, shortfall, nearEnd, thresholds } = data;
  if (!s || s.students === 0) return null;

  const openStudent = (id) => navigate('/admin/students', { state: { focusStudentId: id } });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const onTrack = s.shortfall === 0;

  return (
    <div className="card mb-4" style={{ borderLeft: `4px solid ${onTrack ? 'var(--green)' : 'var(--yellow)'}` }}>
      <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <h3>🎯 Cumplimiento: clases pagadas vs. dadas</h3>
        <span className={`badge ${onTrack ? 'badge-green' : 'badge-yellow'}`}>
          {onTrack ? 'El calendario alcanza ✓' : `${plural(s.shortfall, 'clase', 'clases')} no alcanzan`}
        </span>
      </div>
      <p className="text-xs text-gray mb-3">
        Semestre activo · {plural(s.students, 'estudiante', 'estudiantes')} inscritos y matriculados · {n(s.completed)} ya completaron
      </p>

      <div className="flex items-center gap-2 mb-1">
        <div className="load-bar" style={{ flex: 1 }}>
          <span style={{ width: `${Math.min(100, s.pct || 0)}%`, background: 'var(--green)' }} />
        </div>
        <strong className="text-sm">{s.pct ?? '—'}%</strong>
      </div>
      <div className="text-xs text-gray mb-3">
        {n(s.seen)} clases consumidas de {n(s.paid)} pagadas (asistencias + faltas: la falta consume la clase) · faltan {n(s.remaining)}
      </div>

      <div className="text-sm font-medium mb-2">¿De dónde saldrán las {n(s.remaining)} que faltan?</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }} className="mb-2">
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--green)' }}>{n(s.coveredByCalendar)}</div>
          <div className="lbl">Las cubre el calendario regular que queda</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--gray-600)' }}>{n(s.scheduled)}</div>
          <div className="lbl">Reposiciones ya agendadas</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--red)' }}>{n(s.makeupPending)}</div>
          <div className="lbl">Clases de reposición por agendar · {plural(s.makeupStudents, 'estudiante', 'estudiantes')}</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: 'var(--blue)' }}>{n(s.calendarPending)}</div>
          <div className="lbl">Por recuperar por calendario (festivos y recesos) · {plural(s.calendarStudents, 'estudiante', 'estudiantes')}</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: s.shortfall > 0 ? 'var(--yellow)' : 'var(--gray-400)' }}>{n(s.shortfall)}</div>
          <div className="lbl">No alcanzan antes del cierre · {plural(s.shortfallStudents, 'estudiante', 'estudiantes')}</div>
        </div>
      </div>
      <p className="text-xs text-gray" style={{ marginBottom: 0 }}>
        <strong>Reposición</strong> = lluvia + canceladas por la Escuela + justificadas, menos las ya repuestas: la Escuela las agenda.{' '}
        <strong style={{ color: 'var(--blue)' }}>Recuperar por calendario</strong> = festivos y recesos: no se reponen,
        el calendario regular se corre y las devuelve. Lo que <strong>no alcanza</strong> (déficit) son clases que ni el calendario
        que queda ni las reposiciones cubren antes del cierre del semestre: hay que extender el calendario o programarlas.
      </p>

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 4 }}>
        <div className="font-medium mt-2">📋 Estudiantes que requieren atención</div>

        <Section id="shortfall" open={open.shortfall} onToggle={toggle} color="badge-yellow"
          title="No alcanzan a ver su paquete antes del cierre"
          hint="Les quedan más clases de las que su horario regular alcanza a dar antes de que termine el semestre."
          rows={shortfall} onOpen={openStudent}
          detail={(r) => (
            <>
              <span className="badge badge-yellow">faltan {n(r.shortfall)}</span>
              <div className="text-xs text-gray">
                le quedan {n(r.remaining)} · el calendario da {n(r.leftInSemester)}
                {r.pending > 0 ? ` · ${n(r.pending)} de reposición` : ''}
              </div>
            </>
          )} />

        <Section id="makeups" open={open.makeups} onToggle={toggle} color="badge-red"
          title="Clases de reposición"
          extra={<span className="text-xs text-gray" style={{ marginLeft: 6 }}>({n(data.makeupsTotal)} clases)</span>}
          hint={`Tienen ${thresholds.makeups} o más clases de reposición por agendar: lluvia + canceladas por la Escuela + justificadas, menos las que ya repusieron. Los festivos no cuentan aquí.`}
          rows={makeups} onOpen={openStudent}
          detail={(r) => (
            <>
              <span className="badge badge-red">{n(r.pending)} por reponer</span>
              <div className="text-xs text-gray">
                {n(r.rain)} lluvia{r.other > 0 ? ` · ${n(r.other)} de la Escuela` : ''} · {plural(r.justified, 'justificada', 'justificadas')}
                {r.madeUp > 0 ? ` · repuso ${n(r.madeUp)}` : ''}
              </div>
              {r.calendar > 0 && (
                <div className="text-xs" style={{ color: 'var(--blue)' }}>+ {n(r.calendar)} por calendario</div>
              )}
            </>
          )} />

        <Section id="nearEnd" open={open.nearEnd} onToggle={toggle} color="badge-green"
          title="Por completar el semestre"
          hint={`Les faltan ${thresholds.nearEnd} clases o menos para terminar su paquete.`}
          rows={nearEnd} onOpen={openStudent}
          detail={(r) => (
            <>
              <span className="badge badge-green">{plural(r.remaining, 'clase restante', 'clases restantes')}</span>
              <div className="text-xs text-gray">
                {r.projectedEnd
                  ? `Termina ~${fmtDate(r.projectedEnd, { day: 'numeric', month: 'short' })}${r.endsBeyondSemester ? ' (después del semestre)' : ''}`
                  : ''}
              </div>
            </>
          )} />
      </div>
    </div>
  );
}

function Section({ id, open, onToggle, color, title, hint, rows, detail, extra, onOpen }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn btn-ghost" onClick={() => onToggle(id)}
        style={{ width: '100%', justifyContent: 'space-between', minHeight: 40, padding: '0 4px' }}>
        <span className="font-medium">{title} <span className={`badge ${color}`}>{rows.length}</span>{extra}</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <p className="text-xs text-gray" style={{ margin: '0 4px 6px' }}>{hint}</p>
          {rows.map((r) => (
            <div key={r.studentId} className="card card-tap mb-2" onClick={() => onOpen(r.studentId)}>
              <div className="flex items-center justify-between" style={{ gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-gray">{r.groups.join(' · ') || 'Sin grupo'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>{detail(r)}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
