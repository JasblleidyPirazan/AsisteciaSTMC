import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';

const DAY_ORDER = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DAY_FULL = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
};
const LEVEL_COLOR = {
  Roja: '#E8526A', Naranja: '#EA8A2E', Amarilla: '#E8A23B', Verde: '#1FA971',
  Intermedio: '#7A5AF8', Avanzado: '#3F52A8',
};
const LEVELS = ['Roja', 'Naranja', 'Amarilla', 'Verde'];

function signature(days) {
  return DAY_ORDER.filter((d) => days[d]);
}
function sigLabel(sig) {
  const names = sig.map((d) => DAY_FULL[d]);
  if (names.length === 0) return 'Sin días';
  if (names.length === 1) return names[0];
  return names[0] + ' y ' + names.slice(1).map((n) => n.toLowerCase()).join(' y ');
}

export default function HorariosPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(null);
  const [profFilter, setProfFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [showStudents, setShowStudents] = useState(false);

  useEffect(() => {
    api.get('/groups/schedule')
      .then((d) => setGroups(d || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Pestañas por combinación de días (Lun y Mié, Mar y Jue, ...)
  const tabs = useMemo(() => {
    const map = new Map();
    for (const g of groups) {
      const sig = signature(g.days);
      if (sig.length === 0) continue;
      const key = sig.join(',');
      if (!map.has(key)) map.set(key, { key, sig, label: sigLabel(sig) });
    }
    return [...map.values()].sort((a, b) =>
      DAY_ORDER.indexOf(a.sig[0]) - DAY_ORDER.indexOf(b.sig[0]) || a.sig.length - b.sig.length
    );
  }, [groups]);

  const activeTab = tab || tabs[0]?.key || null;

  const professors = useMemo(
    () => [...new Set(groups.map((g) => g.professor?.name).filter(Boolean))].sort(),
    [groups]
  );
  const courts = useMemo(
    () => [...new Set(groups.map((g) => g.court).filter((c) => c != null))].sort((a, b) => a - b),
    [groups]
  );

  const inTab = groups.filter((g) => {
    if (signature(g.days).join(',') !== activeTab) return false;
    if (profFilter && g.professor?.name !== profFilter) return false;
    if (levelFilter && g.ballLevel !== levelFilter) return false;
    return true;
  });

  const times = [...new Set(inTab.filter((g) => g.court != null).map((g) => g.startTime))]
    .sort((a, b) => a.localeCompare(b));
  const unassigned = inTab.filter((g) => g.court == null);

  function cellGroups(court, time) {
    return inTab.filter((g) => g.court === court && g.startTime === time);
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page page-wide">
      <div className="page-content" style={{ paddingTop: 8 }}>
        <div className="flex items-center justify-between mb-2" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1>Horarios</h1>
            <p className="text-gray text-sm">Malla semanal de las canchas</p>
          </div>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <label className="btn btn-outline" style={{ cursor: 'pointer', gap: 8, display: 'inline-flex', alignItems: 'center' }}>
              <input type="checkbox" checked={showStudents} onChange={(e) => setShowStudents(e.target.checked)} />
              Mostrar estudiantes
            </label>
            <button className="btn btn-outline no-print" onClick={() => window.print()}>🖨 Imprimir</button>
          </div>
        </div>

        {/* Pestañas por días */}
        <div className="flex items-center gap-2 mb-3 no-print" style={{ flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button key={t.key}
              className={`btn ${activeTab === t.key ? 'btn-primary' : 'btn-outline'}`}
              style={{ minHeight: 34, fontSize: '0.85rem' }}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 mb-3 no-print" style={{ flexWrap: 'wrap' }}>
          <select className="form-input form-select" style={{ maxWidth: 200 }}
            value={profFilter} onChange={(e) => setProfFilter(e.target.value)}>
            <option value="">Todos los profes</option>
            {professors.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="form-input form-select" style={{ maxWidth: 200 }}
            value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="">Todos los niveles</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="home-2col" style={{ gridTemplateColumns: '1fr' }}>
          {/* Malla */}
          <div style={{ overflowX: 'auto' }}>
            {times.length === 0 ? (
              <div className="alert alert-info">No hay grupos con cancha asignada para estos días.</div>
            ) : (
              <table className="schedule-grid">
                <thead>
                  <tr>
                    <th style={{ minWidth: 64 }}>Hora</th>
                    {courts.map((c) => <th key={c} style={{ minWidth: 150 }}>Cancha {c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {times.map((time) => (
                    <tr key={time}>
                      <td className="sched-hour">{time}</td>
                      {courts.map((c) => {
                        const gs = cellGroups(c, time);
                        if (gs.length === 0) return <td key={c} className="sched-free">Libre</td>;
                        return (
                          <td key={c}>
                            {gs.map((g) => (
                              <div key={g.id} className="sched-cell"
                                style={{ borderLeft: `3px solid ${LEVEL_COLOR[g.ballLevel] || 'var(--gray-300)'}` }}>
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-sm">{g.code}</span>
                                  <span className="legend-dot" style={{ background: LEVEL_COLOR[g.ballLevel] || 'var(--gray-300)' }} />
                                </div>
                                <div className="text-xs text-gray">{g.professor?.name || '—'}</div>
                                <div className="text-xs text-gray">{g.studentCount}/{g.capacity ?? 8} est.</div>
                                {showStudents && (
                                  <StudentList students={g.students} count={g.studentCount} />
                                )}
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Panel lateral */}
          <div className="home-side">
            <div className="card">
              <h3 className="mb-1">Sin asignar</h3>
              <p className="text-xs text-gray mb-2">Grupos creados sin cancha asignada</p>
              {unassigned.length === 0 ? (
                <div className="text-sm text-gray">Todos los grupos tienen cancha. ✅</div>
              ) : unassigned.map((g) => (
                <div key={g.id} className="sched-cell mb-2"
                  style={{ borderLeft: `3px solid ${LEVEL_COLOR[g.ballLevel] || 'var(--gray-300)'}` }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{g.code}</span>
                    <span className="text-xs text-gray">{g.startTime}</span>
                  </div>
                  <div className="text-xs text-gray">{g.professor?.name || '—'} · {g.studentCount} est.</div>
                  {showStudents && <StudentList students={g.students} count={g.studentCount} />}
                </div>
              ))}
            </div>

            <div className="card">
              <h3 className="mb-2">Niveles (bola)</h3>
              {LEVELS.map((l) => (
                <div key={l} className="legend-row">
                  <span><span className="legend-dot" style={{ background: LEVEL_COLOR[l] }} />{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentList({ students, count }) {
  if (!students || students.length === 0) {
    return <div className="text-xs text-gray" style={{ marginTop: 4, fontStyle: 'italic' }}>
      {count > 0 ? 'Sin permiso para ver nombres' : 'Sin estudiantes'}
    </div>;
  }
  return (
    <ul className="sched-students">
      {students.map((s) => <li key={s.id}>{s.name}</li>)}
    </ul>
  );
}
