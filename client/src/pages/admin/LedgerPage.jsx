import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import StudentLedgerCard from '../../components/StudentLedgerCard';
import StudentQuickPanel from '../../components/StudentQuickPanel';
import { GLOSSARY, SEMAFORO } from '../../utils/glossary';
import { fmtDate } from '../../utils/dates';

const n = (v) => Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 });
const FILTERS = [
  ['ROJO', 'Rojos'], ['AMBAR', 'Ámbar'], ['SIN_PAQUETE', 'Sin paquete'], ['SIN_CONSOLIDAR', 'Sin consolidar'], ['TODOS', 'Todos'],
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
  const [view, setView] = useState('students');
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

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.ledgers || []).filter((l) => {
      if (needle && !l.name.toLowerCase().includes(needle)) return false;
      if (filter === 'ROJO' || filter === 'AMBAR') return l.semaforo === filter;
      if (filter === 'SIN_PAQUETE') return l.paquete.total === 0;
      if (filter === 'SIN_CONSOLIDAR') return l.sinConsolidar.clases > 0;
      return true;
    });
  }, [data, filter, q]);

  const run = (l, action) => {
    const g = l.groups[0];
    if (action.key === 'reports') navigate('/admin/conflicts');
    else if (action.key === 'link') navigate('/admin/makeup-booking');
    else if (action.key === 'extend') navigate('/admin/groups', { state: { focusCode: g?.code, from: { label: 'Reposiciones y reprogramación', to: '/admin/ledger' } } });
    else setPanelId(l.studentId);
  };

  const s = data?.summary;
  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
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
              <div className="text-xs text-gray mt-2">
                {Object.entries(SEMAFORO).map(([k, v]) => (
                  <span key={k} style={{ marginRight: 12 }} title={v.help}>
                    <span style={{ color: v.color }}>●</span> {v.label} {s.semaforo?.[k] ?? 0}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mb-3">
              <button className={`btn ${view === 'students' ? 'btn-primary' : 'btn-outline'}`} style={{ flex: 1, minHeight: 36 }} onClick={() => setView('students')}>Por estudiante</button>
              <button className={`btn ${view === 'groups' ? 'btn-primary' : 'btn-outline'}`} style={{ flex: 1, minHeight: 36 }} onClick={() => setView('groups')}>Por grupo (reprogramación)</button>
            </div>

            {view === 'groups' ? <GroupsView rows={groupRows} navigate={navigate} /> : (<>
            <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
              <input className="form-input" style={{ flex: 1, minWidth: 160 }} placeholder="Buscar estudiante"
                value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="form-input" style={{ width: 'auto' }} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Todos los grupos</option>
                {groups.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
              </select>
            </div>
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
          from={{ label: 'Reposiciones y reprogramación', to: '/admin/ledger' }} />
      )}
    </div>
  );
}

// Festivos y recesos se gestionan por grupo: cada uno contra su plan de clases
function GroupsView({ rows, navigate }) {
  if (!rows) return <div className="spinner" />;
  if (rows.length === 0) return <div className="alert alert-info">No hay grupos activos.</div>;
  return rows.map((g) => {
    const afectados = g.students.conDeficit;
    return (
      <div key={g.groupId} className="card mb-2" style={{ borderLeft: `4px solid ${afectados > 0 ? 'var(--red)' : 'var(--green)'}` }}>
        <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div className="font-medium">{g.code} <span className="text-xs text-gray">{g.professor?.name}</span></div>
            <div className="text-xs text-gray">
              Plan {g.plan} · dadas {g.dadas} · por dar {g.porDar}
            </div>
          </div>
          <button className="btn btn-outline" style={{ minHeight: 34, fontSize: '0.8rem' }}
            onClick={() => navigate('/admin/groups', { state: { focusCode: g.code, from: { label: 'Reposiciones y reprogramación', to: '/admin/ledger' } } })}>
            {afectados > 0 ? 'Proponer extensión' : 'Ver grupo'}
          </button>
        </div>
        <div className="text-xs mt-1">
          <span title={GLOSSARY.reprogramacion} style={{ color: 'var(--blue)' }}>Festivos y recesos: {g.festivos}</span>
          {g.festivosFechas?.length > 0 && <> ({g.festivosFechas.map((f) => `${fmtDate(f.date, { day: 'numeric', month: 'short' })}${f.reason ? ` · ${f.reason}` : ''}`).join('; ')})</>}
          {' · '}Lluvia: {g.lluvia}
        </div>
        <div className="text-xs text-gray">
          Fin planeado {g.finPlaneado ? fmtDate(g.finPlaneado) : '—'} · fin estimado {g.finEstimado ? fmtDate(g.finEstimado) : '—'}
          {g.retrasoDias > 0 && ` (${g.retrasoDias} días de retraso)`}
        </div>
        <div className="text-xs mt-1" style={{ color: afectados > 0 ? 'var(--red)' : 'var(--green)' }}>
          {afectados > 0
            ? `${afectados} de ${g.students.conPaquete} estudiantes no alcanzan antes del cierre (déficit ${g.students.deficit})`
            : `Los ${g.students.conPaquete} estudiantes con paquete alcanzan antes del cierre`}
        </div>
      </div>
    );
  });
}
