import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { fmtDate } from '../utils/dates';

// Al entrar, el coordinador ve de un vistazo a quién hay que atender:
// estudiantes con 3+ clases por reponer y estudiantes a 3 clases (o menos) de
// completar su semestre. También lo ven Admin y Superadmin en su panel de inicio.
export default function CoordinatorStudentsPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState({ makeups: true, nearEnd: true });

  useEffect(() => {
    if (!['ADMIN', 'PHYSICAL_TRAINER', 'SUPERADMIN'].includes(user?.role)) return;
    api.get('/alerts/coordinator').then(setData).catch(() => {});
  }, [user?.role]);

  if (!data || data.total === 0) return null;
  const { makeups, nearEnd, thresholds } = data;

  const openStudent = (id) => navigate('/admin/students', { state: { focusStudentId: id } });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  function Section({ id, color, title, hint, rows, detail }) {
    if (rows.length === 0) return null;
    return (
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-ghost" onClick={() => toggle(id)}
          style={{ width: '100%', justifyContent: 'space-between', minHeight: 40, padding: '0 4px' }}>
          <span className="font-medium">{title} <span className={`badge ${color}`}>{rows.length}</span></span>
          <span>{open[id] ? '▾' : '▸'}</span>
        </button>
        {open[id] && (
          <>
            <p className="text-xs text-gray" style={{ margin: '0 4px 6px' }}>{hint}</p>
            {rows.map((r) => (
              <div key={r.studentId} className="card card-tap mb-2" onClick={() => openStudent(r.studentId)}>
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

  return (
    <div className="card mb-4" style={{ borderLeft: '4px solid var(--yellow)' }}>
      <div className="font-medium">📋 Estudiantes que requieren tu atención</div>
      <Section id="makeups" color="badge-red"
        title="Clases por reponer"
        hint={`Tienen ${thresholds.makeups} clases o más por reponer: lluvia + justificadas + festivos / fechas excluidas, menos las que ya repusieron.`}
        rows={makeups}
        detail={(r) => (
          <>
            <span className="badge badge-red">{r.pending} por reponer</span>
            <div className="text-xs text-gray">
              {r.rain} lluvia · {r.justified} justificada{r.justified !== 1 ? 's' : ''}
              {' · '}
              <span style={{ color: 'var(--blue)', fontWeight: 600 }} title="Clases que cayeron en festivos o fechas excluidas">
                {r.holidays} festivo{r.holidays !== 1 ? 's' : ''}
              </span>
              {r.madeUp > 0 ? ` · repuso ${r.madeUp}` : ''}
            </div>
          </>
        )} />
      <Section id="nearEnd" color="badge-green"
        title="Por completar el semestre"
        hint={`Les faltan ${thresholds.nearEnd} clases o menos para terminar su paquete.`}
        rows={nearEnd}
        detail={(r) => (
          <>
            <span className="badge badge-green">
              {r.remaining} clase{r.remaining !== 1 ? 's' : ''} restante{r.remaining !== 1 ? 's' : ''}
            </span>
            <div className="text-xs text-gray">
              {r.projectedEnd
                ? `Termina ~${fmtDate(r.projectedEnd, { day: 'numeric', month: 'short' })}${r.endsBeyondSemester ? ' (después del semestre)' : ''}`
                : ''}
            </div>
          </>
        )} />
    </div>
  );
}
