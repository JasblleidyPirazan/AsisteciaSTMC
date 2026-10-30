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
        Avance de cada grupo en el semestre <strong>{data.semester.name}</strong>. El plan es de{' '}
        <strong>{data.plan} clases</strong> por grupo (<strong>{Math.round(data.plan / 2)}</strong> si el grupo
        tiene un solo día a la semana); los <strong>festivos / recesos</strong> y la{' '}
        <strong>lluvia</strong> corren la fecha final estimada. Toca un grupo para ver el avance de sus
        estudiantes; al final hay una tabla resumen para ver dónde poner el esfuerzo.
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
                <Metric label="Clases dadas" sub={g.upcoming > 0 ? `faltan ${g.upcoming} por dictar` : 'plan completo'}>{g.given} de {g.plan}</Metric>
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
                      {s.calendar > 0 && (
                        <span style={{ color: 'var(--blue)', fontWeight: 600, marginRight: 6 }}
                          title="Festivos y recesos: no se reponen, el calendario regular se corre y los devuelve">
                          {s.calendar} por calendario
                        </span>
                      )}
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

      <SummaryTable groups={data.groups} plan={data.plan} />
    </>
  );
}

// Tabla resumen de todos los grupos, ordenable: sirve para ver de un vistazo
// dónde poner el esfuerzo (más reposiciones pendientes, más retraso, menos avance).
const COLS = [
  { key: 'code', label: 'Grupo', get: (g) => g.code, text: true },
  { key: 'prof', label: 'Profesor', get: (g) => g.professor?.name || '', text: true },
  { key: 'pct', label: '% avance', get: (g) => g.pct ?? -1, title: 'Clases dadas / plan' },
  { key: 'given', label: 'Dadas', get: (g) => g.given },
  { key: 'upcoming', label: 'Faltan', get: (g) => g.upcoming, title: 'Clases del plan por dictar' },
  { key: 'holidays', label: 'Festivos', get: (g) => g.holidaysLostPast, title: 'Clases no dadas por festivos y recesos (a hoy)' },
  { key: 'rain', label: 'Lluvia', get: (g) => g.rain },
  { key: 'students', label: 'Est. a reponer', get: (g) => g.studentsWithMakeups, title: 'Estudiantes del grupo con clases por reponer' },
  { key: 'makeups', label: 'Por reponer', get: (g) => g.makeupClasses, title: 'Suma de clases por reponer de sus estudiantes' },
  { key: 'delay', label: 'Retraso (d)', get: (g) => g.delayDays ?? 0, title: 'Retraso en días: fecha estimada final vs. fin del plan' },
  { key: 'end', label: 'Fin estimado', get: (g) => g.estimatedEnd || '', text: true },
];

function SummaryTable({ groups, plan }) {
  const [sort, setSort] = useState({ key: 'makeups', dir: 'desc' });
  if (groups.length === 0) return null;
  const col = COLS.find((c) => c.key === sort.key) || COLS[0];
  const rows = [...groups].sort((a, b) => {
    const x = col.get(a);
    const y = col.get(b);
    const cmp = col.text ? String(x).localeCompare(String(y), 'es', { numeric: true }) : x - y;
    return sort.dir === 'asc' ? cmp : -cmp;
  });
  const sum = (fn) => groups.reduce((acc, g) => acc + fn(g), 0);
  const totalPlan = sum((g) => g.plan);
  const totalGiven = sum((g) => g.given);

  function toggle(key, text) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: text ? 'asc' : 'desc' }));
  }

  return (
    <div className="card mt-4" style={{ padding: '12px 8px' }}>
      <h3 style={{ marginBottom: 4 }}>Resumen: ¿dónde poner el esfuerzo?</h3>
      <p className="text-xs text-gray mb-2">
        Ordenado por clases por reponer. Toca un encabezado para ordenar por otra columna.
      </p>
      {/* Compacta: encabezados que se parten en dos líneas y celdas angostas para
          que quepa en la ventana sin scroll horizontal. */}
      <style>{'.summary-compact th, .summary-compact td { padding: 6px 4px; }'}</style>
      <table className="data-table summary-compact" style={{ width: '100%', fontSize: '0.76rem' }}>
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c.key} title={c.title || 'Ordenar'} onClick={() => toggle(c.key, c.text)}
                style={{ cursor: 'pointer', userSelect: 'none', textAlign: c.text ? 'left' : 'right', verticalAlign: 'bottom', lineHeight: 1.2 }}>
                {c.label} <span style={{ opacity: sort.key === c.key ? 1 : 0.35, fontSize: '0.75em' }}>
                  {sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.groupId}>
              <td className="font-medium" style={{ whiteSpace: 'nowrap' }}>{g.code}</td>
              <td>{g.professor?.name || '—'}</td>
              <td style={{ textAlign: 'right', color: trafficColor(g.pct), fontWeight: 600 }}>{g.pct == null ? '—' : `${g.pct}%`}</td>
              <td style={{ textAlign: 'right' }}>{g.given}</td>
              <td style={{ textAlign: 'right' }}>{g.upcoming}</td>
              <td style={{ textAlign: 'right', color: g.holidaysLostPast > 0 ? 'var(--blue)' : undefined }}>{g.holidaysLostPast}</td>
              <td style={{ textAlign: 'right' }}>{g.rain}</td>
              <td style={{ textAlign: 'right' }}>{g.studentsWithMakeups} de {g.studentsCount}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: g.makeupClasses > 0 ? 'var(--red)' : undefined }}>{g.makeupClasses}</td>
              <td style={{ textAlign: 'right', color: (g.delayDays || 0) > 0 ? 'var(--red)' : undefined }}>
                {g.delayDays == null ? '—' : g.delayDays}
              </td>
              <td style={{ textAlign: 'right' }}>
                {g.estimatedEnd ? fmtDate(g.estimatedEnd, { day: 'numeric', month: 'short' }) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td colSpan={2}>Total ({groups.length} grupos)</td>
            <td style={{ textAlign: 'right' }}>{totalPlan > 0 ? `${Math.round((totalGiven / totalPlan) * 100)}%` : '—'}</td>
            <td style={{ textAlign: 'right' }}>{totalGiven}</td>
            <td style={{ textAlign: 'right' }}>{sum((g) => g.upcoming)}</td>
            <td style={{ textAlign: 'right' }}>{sum((g) => g.holidaysLostPast)}</td>
            <td style={{ textAlign: 'right' }}>{sum((g) => g.rain)}</td>
            <td style={{ textAlign: 'right' }}>{sum((g) => g.studentsWithMakeups)}</td>
            <td style={{ textAlign: 'right' }}>{Math.round(sum((g) => g.makeupClasses) * 10) / 10}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
