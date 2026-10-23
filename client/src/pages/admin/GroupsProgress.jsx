import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';

// Avance de grupos (Reportes → Avance de grupos).
//
// Una tarjeta por grupo con: fecha de inicio del plan, fecha final estimada,
// clases dadas, y clases no dadas por festivos / recesos (y por lluvia). Al
// tocar una tarjeta se despliegan sus estudiantes con su nivel de avance.
// Datos de GET /reports/groups-progress (services/semesterProgress.js).

const short = (d) => (d ? fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function trafficColor(pct) {
  if (pct == null) return 'var(--gray-400)';
  if (pct >= 85) return 'var(--green)';
  if (pct >= 60) return 'var(--yellow)';
  return 'var(--red)';
}

// Avance del estudiante frente al del grupo: al día = verde, rezagado = rojo.
function vsGroupColor(studentPct, groupPct) {
  if (studentPct == null || groupPct == null) return 'var(--gray-400)';
  const delta = studentPct - groupPct;
  if (delta >= -10) return 'var(--green)';
  if (delta >= -25) return 'var(--yellow)';
  return 'var(--red)';
}

function Bar({ pct, color }) {
  return (
    <div className="load-bar" style={{ flex: 1, minWidth: 40 }}>
      <span style={{ width: `${Math.min(100, pct || 0)}%`, background: color }} />
    </div>
  );
}

function Metric({ label, children, sub }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div className="text-xs text-gray">{label}</div>
      <div className="font-medium">{children}</div>
      {sub && <div className="text-xs text-gray">{sub}</div>}
    </div>
  );
}

export default function GroupsProgress() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/reports/groups-progress').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="spinner" />;
  if (!data.semester) {
    return <div className="alert alert-info">No hay un semestre activo — no hay calendario con el cual medir el avance.</div>;
  }

  const q = search.trim().toLowerCase();
  const groups = data.groups.filter((g) => !q || g.code.toLowerCase().includes(q) || (g.professor?.name || '').toLowerCase().includes(q));

  return (
    <>
      <p className="text-sm text-gray mb-3">
        Avance de cada grupo en el semestre <strong>{data.semester.name}</strong>. El plan es dictar todas las
        clases del calendario; los <strong>festivos / recesos</strong> y la <strong>lluvia</strong> corren la
        fecha final estimada. Toca un grupo para ver el avance de sus estudiantes.
      </p>
      <input className="form-input mb-3" placeholder="Buscar grupo o profesor…" value={search}
        onChange={(e) => setSearch(e.target.value)} />

      {groups.length === 0 && <div className="alert alert-info">Sin resultados.</div>}
      {groups.map((g) => {
        const open = openId === g.groupId;
        return (
          <div key={g.groupId} className="card mb-2">
            <div className="card-tap" onClick={() => setOpenId(open ? null : g.groupId)}
              style={{ cursor: 'pointer' }} title="Ver estudiantes">
              <div className="flex items-center justify-between" style={{ gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <span className="font-medium">{g.code}</span>
                  {g.ballLevel && <span className="chip" style={{ marginLeft: 6 }}>{g.ballLevel}{g.subLevel || ''}</span>}
                  <div className="text-xs text-gray">{g.days} · {g.professor?.name}</div>
                </div>
                <span>{open ? '▾' : '▸'}</span>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <Bar pct={g.pct} color={trafficColor(g.pct)} />
                <span className="text-sm font-medium" style={{ width: 46, textAlign: 'right', color: trafficColor(g.pct) }}>
                  {g.pct == null ? '—' : `${g.pct}%`}
                </span>
              </div>

              <div className="flex gap-3 mt-2" style={{ flexWrap: 'wrap' }}>
                <Metric label="Inicio del grupo">{short(g.startDate)}</Metric>
                <Metric label="Fecha estimada final"
                  sub={g.estimatedEnd && g.plannedEnd && g.estimatedEnd !== g.plannedEnd ? `Plan: ${short(g.plannedEnd)}` : null}>
                  {short(g.estimatedEnd)}
                </Metric>
                <Metric label="Clases dadas" sub={`faltan ${g.upcoming} programadas`}>{g.given} de {g.plan}</Metric>
                <Metric label="No dadas: festivos y recesos"
                  sub={g.holidaysLost > g.holidaysLostPast ? `${g.holidaysLost - g.holidaysLostPast} más por venir` : null}>
                  {g.holidaysLostPast}
                </Metric>
                <Metric label="No dadas: lluvia">{g.rain}</Metric>
              </div>
            </div>

            {open && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 10 }}>
                {g.holidayDates.length > 0 && (
                  <div className="text-xs text-gray mb-2">
                    📅 Festivos y recesos del grupo:{' '}
                    {g.holidayDates.map((d) => `${short(d.date)}${d.reason ? ` (${d.reason})` : ''}`).join(' · ')}
                  </div>
                )}
                {g.students.length === 0 ? (
                  <div className="text-sm text-gray">Sin estudiantes activos en este grupo.</div>
                ) : g.students.map((s) => (
                  <div key={s.studentId} className="mb-2">
                    <div className="flex items-center justify-between" style={{ gap: 8 }}>
                      <span className="font-medium">
                        {s.name} {s.completed && <span title="Semestre completado">🎓</span>}
                      </span>
                      <span className="text-sm">
                        {s.seen} / {s.total || '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Bar pct={s.pct} color={vsGroupColor(s.pct, g.pct)} />
                      <span className="text-xs" style={{ width: 40, textAlign: 'right' }}>{s.pct == null ? '—' : `${s.pct}%`}</span>
                    </div>
                    <div className="text-xs text-gray">
                      {s.pending > 0 && <span className="badge badge-red" style={{ marginRight: 6 }}>{s.pending} por reponer</span>}
                      {s.completed ? 'Semestre completado'
                        : s.projectedEnd ? `Termina ~${short(s.projectedEnd)}${s.endsBeyondSemester ? ' (después del semestre)' : ''}`
                        : s.total ? '' : 'Sin clases adquiridas'}
                    </div>
                  </div>
                ))}
                {g.students.length > 0 && (
                  <div className="text-xs text-gray">
                    Barra del estudiante: verde = al ritmo del grupo ({g.pct ?? '—'}%) · amarillo = algo rezagado · rojo = muy rezagado.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
