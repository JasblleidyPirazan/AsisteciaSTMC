import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import StudentLedgerCard from '../../components/StudentLedgerCard';
import StudentQuickPanel from '../../components/StudentQuickPanel';
import { GLOSSARY, SEMAFORO } from '../../utils/glossary';
import { fmtDate } from '../../utils/dates';

const n = (v) => Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 });
const FILTERS = [
  ['ROJO', 'Rojos'], ['AMBAR', 'Ámbar'], ['SIN_PAQUETE', 'Sin paquete'], ['SIN_CONSOLIDAR', 'Sin consolidar'], ['EXCEDENTE', 'Con excedente'], ['TODOS', 'Todos'],
];

// La acción que corresponde a cada fila según el color (brief 4.3)
function actionFor(l) {
  if (l.paquete.total === 0) return { key: 'student', label: 'Cargar clases adquiridas' };
  if (l.pendientes.deficit > 0) return { key: 'extend', label: 'Extender calendario' };
  if (l.sinConsolidar.clases >= 3) return { key: 'reports', label: 'Cerrar reportes' };
  if (l.reposicion.porAgendar > 0) return { key: 'link', label: 'Enviar enlace' };
  if (l.sinConsolidar.clases > 0) return { key: 'reports', label: 'Cerrar reportes' };
  return null;
}

export default function LedgerPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ROJO');
  const [groupId, setGroupId] = useState('');
  const [q, setQ] = useState('');
  const [panelId, setPanelId] = useState(null);
  const [view, setView] = useState('makeups');
  const [groupRows, setGroupRows] = useState(null);

  useEffect(() => {
    setData(null);
    const params = groupId ? { groupId } : undefined;
    api.get('/ledger', params).then(setData).catch((e) => setError(e.message));
  }, [groupId]);

  useEffect(() => {
    if (view !== 'groups' || groupRows) return;
    api.get('/ledger/groups').then((d) => setGroupRows(d.groups || [])).catch((e) => setError(e.message));
  }, [view, groupRows]);

  const groups = useMemo(() => {
    const map = new Map();
    (data?.ledgers || []).forEach((l) => l.groups.forEach((g) => map.set(g.id, g.code)));
    return [...map].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'es', { numeric: true }));
  }, [data]);

  // Búsqueda por nombre: aplica a las dos pestañas de estudiantes
  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.ledgers || []).filter((l) => !needle || l.name.toLowerCase().includes(needle));
  }, [data, q]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.ledgers || []).filter((l) => {
      if (needle && !l.name.toLowerCase().includes(needle)) return false;
      if (filter === 'ROJO' || filter === 'AMBAR') return l.semaforo === filter;
      if (filter === 'SIN_PAQUETE') return l.paquete.total === 0;
      if (filter === 'SIN_CONSOLIDAR') return l.sinConsolidar.clases > 0;
      if (filter === 'EXCEDENTE') return l.consumidas.excedente > 0;
      return true;
    });
  }, [data, filter, q]);

  const run = (l, action) => {
    const g = l.groups[0];
    if (action.key === 'reports') navigate('/admin/conflicts');
    else if (action.key === 'link') navigate('/admin/makeup-booking');
    else if (action.key === 'extend') navigate('/admin/groups', { state: { focusCode: g?.code, from: { label: 'Reposiciones y reprogramación', to: '/admin' } } });
    else setPanelId(l.studentId);
  };

  const s = data?.summary;
  return (
    <div className="page">
      <div className="page-header">
        <h1>Reposiciones y reprogramación</h1>
      </div>
      <div className="page-content">
        {error && <div className="alert alert-error mb-3">{error}</div>}
        {!data && !error && <div className="spinner" />}
        {data && !data.semester && <div className="alert alert-info">No hay un semestre activo.</div>}
        {data?.semester && s && (
          <>
            <div className="card mb-3">
              <div className="text-sm font-medium mb-1">
                Meta del semestre {data.semester.name}: clases vistas = clases pagadas
              </div>
              <div className="flex gap-3 mb-1" style={{ flexWrap: 'wrap' }}>
                <span title={GLOSSARY.pagadas}>Pagadas <strong>{n(s.paquete)}</strong></span>
                <span title={GLOSSARY.vistas}>Vistas <strong>{n(s.consumidas)}</strong></span>
                <span title={GLOSSARY.faltan}>Faltan <strong>{n(s.pendientes.total)}</strong></span>
              </div>
              <div className="load-bar mb-2"><span style={{ width: `${Math.min(100, s.pct || 0)}%`, background: 'var(--green)' }} /></div>
              <div className="flex gap-3 text-sm" style={{ flexWrap: 'wrap' }}>
                <span title={GLOSSARY.calendario} style={{ color: 'var(--green)' }}>Calendario cubre <strong>{n(s.pendientes.cubreCalendario)}</strong></span>
                <span title={GLOSSARY.agendadas}>Agendadas <strong>{n(s.pendientes.agendadasAplicadas)}</strong></span>
                <span title={GLOSSARY.porAgendar} style={{ color: 'var(--yellow)' }}>Por agendar <strong>{n(s.pendientes.porAgendar)}</strong></span>
                <span title={GLOSSARY.deficit} style={{ color: 'var(--red)' }}>Déficit <strong>{n(s.pendientes.deficit)}</strong></span>
              </div>
              {s.excedente?.clases > 0 && (
                <div className="text-xs mt-2" style={{ color: 'var(--blue)' }} title={GLOSSARY.excedente}>
                  +{n(s.excedente.clases)} clases vistas de más en {s.excedente.students} {s.excedente.students === 1 ? 'estudiante' : 'estudiantes'}
                  {' '}(clases regaladas por encima de lo pagado) · <button className="link-name" onClick={() => setFilter('EXCEDENTE')}>ver ›</button>
                </div>
              )}
              <div className="text-xs text-gray mt-2">
                {Object.entries(SEMAFORO).map(([k, v]) => (
                  <span key={k} style={{ marginRight: 12 }} title={v.help}>
                    <span style={{ color: v.color }}>●</span> {v.label} {s.semaforo?.[k] ?? 0}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
              {[['makeups', 'Estudiantes por reponer'], ['students', 'Estudiantes por reponer y reprogramar'], ['groups', 'Grupos']].map(([k, label]) => (
                <button key={k} className={`btn ${view === k ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1, minHeight: 36, minWidth: 150 }} onClick={() => setView(k)}>{label}</button>
              ))}
            </div>

            {view !== 'groups' && (
              <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
                <input className="form-input" style={{ flex: 1, minWidth: 160 }} placeholder="Buscar estudiante"
                  value={q} onChange={(e) => setQ(e.target.value)} />
                <select className="form-input" style={{ width: 'auto' }} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">Todos los grupos</option>
                  {groups.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
                </select>
              </div>
            )}

            {view === 'groups' ? <GroupsView rows={groupRows} totalDeficit={s.pendientes.deficit} />
            : view === 'makeups' ? <MakeupsView ledgers={searched} onOpen={setPanelId} onLink={() => navigate('/admin/makeup-booking')} />
            : (<>
            <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
              {FILTERS.map(([k, label]) => (
                <button key={k} className={`btn ${filter === k ? 'btn-primary' : 'btn-outline'}`}
                  style={{ minHeight: 34, fontSize: '0.8rem' }} onClick={() => setFilter(k)}>{label}</button>
              ))}
            </div>

            {rows.length === 0 ? (
              <div className="alert alert-success">🎾 Ningún estudiante en este filtro.</div>
            ) : rows.map((l) => {
              const action = actionFor(l);
              return (
                <div key={l.studentId} className="card mb-2"
                  style={{ borderLeft: `4px solid ${(SEMAFORO[l.semaforo] || SEMAFORO.GRIS).color}` }}>
                  <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <button className="link-name font-medium" onClick={() => setPanelId(l.studentId)}>{l.name} ›</button>
                      <div className="text-xs text-gray">
                        {l.groups.map((g) => g.code).join(' · ') || 'Sin grupo'}
                        {l.proyeccion.fin && ` · fin estimado ${fmtDate(l.proyeccion.fin)}${l.proyeccion.excedeSemestre ? ' (después del cierre)' : ''}`}
                        {l.calendario.recuperables > 0 && ` · ${n(l.calendario.recuperables)} reprogramadas por festivo`}
                      </div>
                    </div>
                    {action && (
                      <button className="btn btn-outline" style={{ minHeight: 34, fontSize: '0.8rem' }} onClick={() => run(l, action)}>
                        {action.label}
                      </button>
                    )}
                  </div>
                  <div className="mt-1">
                    <StudentLedgerCard ledger={l} onSinConsolidar={() => navigate('/admin/conflicts')} />
                  </div>
                </div>
              );
            })}
            </>)}
          </>
        )}
      </div>
      {panelId && (
        <StudentQuickPanel studentId={panelId} onClose={() => setPanelId(null)}
          from={{ label: 'Reposiciones y reprogramación', to: '/admin' }} />
      )}
    </div>
  );
}

// Festivos y recesos se gestionan por grupo: cada uno contra su plan de clases.
// Primero las cifras; al tocar un grupo se despliega el detalle.
function GroupsView({ rows, totalDeficit }) {
  const [open, setOpen] = useState({});
  if (!rows) return <div className="spinner" />;
  if (rows.length === 0) return <div className="alert alert-info">No hay grupos activos.</div>;

  const afectados = rows.filter((g) => g.students.conDeficit > 0);
  // El total viene del resumen general (cada estudiante una vez). Sumar los grupos
  // daría más: un estudiante en dos grupos aparece en ambos.
  const deficit = totalDeficit;
  const short = (d) => (d ? fmtDate(d, { day: 'numeric', month: 'short' }) : '—');

  return (
    <>
      <div className="card mb-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <Stat value={rows.length} label="grupos activos" />
        <Stat value={afectados.length} label="grupos con estudiantes que no alcanzan" color={afectados.length ? 'var(--red)' : 'var(--green)'} />
        <Stat value={n(deficit)} label="clases de déficit en total" color={deficit ? 'var(--red)' : 'var(--green)'} />
      </div>
      <p className="text-xs text-gray mb-2">
        Ordenados por déficit. Toca un grupo para ver los festivos, las fechas de fin y el detalle de sus estudiantes.
        El déficit de cada grupo cuenta a todos sus estudiantes: quien está en dos grupos aparece en ambos, por eso la suma de los grupos puede ser mayor que el total.
      </p>

      {rows.map((g) => {
        const isOpen = !!open[g.groupId];
        const pct = g.plan > 0 ? Math.min(100, Math.round((g.dadas / g.plan) * 100)) : 0;
        const bad = g.students.conDeficit > 0;
        return (
          <div key={g.groupId} className="card mb-2" style={{ borderLeft: `4px solid ${bad ? 'var(--red)' : 'var(--green)'}`, cursor: 'pointer' }}
            onClick={() => setOpen((o) => ({ ...o, [g.groupId]: !o[g.groupId] }))}>
            <div className="flex items-center justify-between" style={{ gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <span className="font-medium">{g.code}</span>{' '}
                <span className="text-xs text-gray">{g.professor?.name}</span>
              </div>
              <span className="text-gray" aria-hidden>{isOpen ? '▾' : '▸'}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8, marginTop: 8 }}>
              <div>
                <div className="text-sm"><strong>{g.dadas}</strong><span className="text-gray">/{g.plan}</span></div>
                <div className="load-bar" style={{ margin: '3px 0' }}><span style={{ width: `${pct}%`, background: 'var(--brand-indigo)' }} /></div>
                <div className="text-xs text-gray">clases dadas</div>
              </div>
              <Mini value={g.festivos} label="festivos y recesos" color="var(--blue)" title={GLOSSARY.reprogramacion} />
              <Mini value={g.lluvia} label="por lluvia" />
              <Mini value={g.retrasoDias > 0 ? `+${g.retrasoDias}` : '0'} label="días de retraso" color={g.retrasoDias > 0 ? 'var(--yellow)' : undefined} />
              <Mini value={`${g.students.conDeficit}/${g.students.conPaquete}`} label="no alcanzan" color={bad ? 'var(--red)' : 'var(--green)'} />
            </div>

            {isOpen && (
              <div className="mt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }} onClick={(e) => e.stopPropagation()}>
                <div className="text-sm mb-1">
                  Fin planeado <strong>{short(g.finPlaneado)}</strong> → fin estimado <strong>{short(g.finEstimado)}</strong>
                  {g.retrasoDias > 0 && <span style={{ color: 'var(--yellow)' }}> ({g.retrasoDias} días después)</span>}
                </div>
                <div className="text-xs text-gray mb-2">Le faltan {g.porDar} de {g.plan} clases del plan.</div>

                <div className="text-xs font-medium mb-1" style={{ color: 'var(--blue)' }}>Festivos y recesos ({g.festivos}) — se reprograman, no se reponen</div>
                {g.festivosFechas?.length > 0 ? (
                  <div className="flex gap-1 mb-2" style={{ flexWrap: 'wrap' }}>
                    {g.festivosFechas.map((f) => (
                      <span key={f.date} className="badge badge-blue">{short(f.date)}{f.reason ? ` · ${f.reason}` : ''}</span>
                    ))}
                  </div>
                ) : <div className="text-xs text-gray mb-2">Ninguno en sus días.</div>}

                <div className="text-xs font-medium mb-1">Sus estudiantes</div>
                <div className="text-xs" style={{ color: bad ? 'var(--red)' : 'var(--green)' }}>
                  {bad
                    ? `${g.students.conDeficit} de ${g.students.conPaquete} no alcanzan antes del cierre · déficit de ${n(g.students.deficit)} clases`
                    : `Los ${g.students.conPaquete} estudiantes con paquete alcanzan antes del cierre`}
                </div>
                <div className="text-xs text-gray">
                  Reposición por agendar: {n(g.students.porAgendar)} · clases sin consolidar: {g.students.sinConsolidar}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function Stat({ value, label, color }) {
  return (
    <div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
      <div className="text-xs text-gray">{label}</div>
    </div>
  );
}

function Mini({ value, label, color, title }) {
  return (
    <div title={title}>
      <div className="text-sm"><strong style={{ color }}>{value}</strong></div>
      <div className="text-xs text-gray">{label}</div>
    </div>
  );
}

// Solo reposición: lo que la Escuela debe programar por lluvia y por justificadas
// (y por clases que canceló la Escuela, D1). Cifras arriba; al tocar, las fechas.
function MakeupsView({ ledgers, onOpen, onLink }) {
  const [open, setOpen] = useState({});
  const list = ledgers
    .filter((l) => l.reposicion.pendientes > 0)
    .sort((a, b) => b.reposicion.porAgendar - a.reposicion.porAgendar || b.reposicion.pendientes - a.reposicion.pendientes || a.name.localeCompare(b.name, 'es'));
  const sum = (fn) => list.reduce((acc, l) => acc + fn(l), 0);
  const TYPE = { RAIN: 'Lluvia', JUSTIFIED: 'Justificada', OTHER: 'Cancelada por la Escuela' };
  const short = (d) => fmtDate(d, { day: 'numeric', month: 'short' });

  return (
    <>
      <div className="card mb-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <Stat value={list.length} label="estudiantes por reponer" />
        <Stat value={n(sum((l) => l.reposicion.pendientes))} label="clases por reponer" color="var(--yellow)" />
        <Stat value={n(sum((l) => l.reposicion.agendadas))} label="ya agendadas" />
        <Stat value={n(sum((l) => l.reposicion.porAgendar))} label="por agendar" color={sum((l) => l.reposicion.porAgendar) ? 'var(--red)' : 'var(--green)'} />
      </div>
      <p className="text-xs text-gray mb-2">
        {GLOSSARY.reposicion} Los festivos y recesos no van aquí: se reprograman. Toca un estudiante para ver las fechas.
      </p>

      {list.length === 0 ? <div className="alert alert-success">🎾 Ningún estudiante tiene clases por reponer.</div> : list.map((l) => {
        const r = l.reposicion;
        const isOpen = !!open[l.studentId];
        return (
          <div key={l.studentId} className="card mb-2" style={{ borderLeft: `4px solid ${r.porAgendar > 0 ? 'var(--yellow)' : 'var(--green)'}`, cursor: 'pointer' }}
            onClick={() => setOpen((o) => ({ ...o, [l.studentId]: !o[l.studentId] }))}>
            <div className="flex items-center justify-between" style={{ gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <span className="font-medium">{l.name}</span>{' '}
                <span className="text-xs text-gray">{l.groups.map((g) => g.code).join(' · ') || 'Sin grupo'}</span>
              </div>
              <span className="text-gray" aria-hidden>{isOpen ? '▾' : '▸'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8, marginTop: 8 }}>
              <Mini value={r.lluvia} label="lluvia" />
              <Mini value={r.justificadas} label="justificadas" />
              {r.otras > 0 && <Mini value={r.otras} label="canceladas por la Escuela" />}
              <Mini value={n(r.repuestas)} label="ya repuestas" />
              <Mini value={n(r.pendientes)} label="por reponer" color="var(--yellow)" />
              <Mini value={n(r.porAgendar)} label="por agendar" color={r.porAgendar > 0 ? 'var(--red)' : 'var(--green)'} />
            </div>

            {isOpen && (
              <div className="mt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }} onClick={(e) => e.stopPropagation()}>
                <div className="text-xs font-medium mb-1">Clases que dan derecho a reposición</div>
                <div className="flex gap-1 mb-2" style={{ flexWrap: 'wrap' }}>
                  {(r.items || []).map((it, i) => (
                    <span key={i} className={`badge ${it.type === 'JUSTIFIED' ? 'badge-yellow' : 'badge-gray'}`}>
                      {short(it.date)} · {TYPE[it.type] || it.type}{it.groupCode ? ` · ${it.groupCode}` : ''}
                    </span>
                  ))}
                </div>
                {(r.repuestasItems || []).length > 0 && (
                  <>
                    <div className="text-xs font-medium mb-1">Reposiciones vistas</div>
                    <div className="flex gap-1 mb-2" style={{ flexWrap: 'wrap' }}>
                      {r.repuestasItems.map((it, i) => (
                        <span key={i} className="badge badge-green">
                          {short(it.date)}{it.units > 1 ? ` · vale ${it.units}` : ''}{it.absent ? ' · faltó (perdida)' : ''}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {r.agendadas > 0 && <div className="text-xs text-gray mb-2">Tiene {n(r.agendadas)} reposición(es) ya agendada(s).</div>}
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {r.porAgendar > 0 && (
                    <button className="btn btn-outline" style={{ minHeight: 32, fontSize: '0.8rem' }} onClick={onLink}>Enviar enlace para agendar</button>
                  )}
                  <button className="btn btn-ghost" style={{ minHeight: 32, fontSize: '0.8rem' }} onClick={() => onOpen(l.studentId)}>Ver ficha</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
