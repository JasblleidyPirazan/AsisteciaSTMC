import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';

// Malla semanal organizada SOLO por horarios (las canchas ya no estructuran la
// vista; se muestran como dato dentro de cada grupo). Los estudiantes van
// siempre visibles, distinguiendo matriculados (verde) de inscritos (amarillo).

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
const ENROLLED_COLOR = 'var(--green)'; // matriculado (pago completo)
const REGISTERED_COLOR = '#E8A23B';    // inscrito (pago pendiente)

function signature(days) {
  return DAY_ORDER.filter((d) => days[d]);
}
function sigLabel(sig) {
  const names = sig.map((d) => DAY_FULL[d]);
  if (names.length === 0) return 'Sin días';
  if (names.length === 1) return names[0];
  return names[0] + ' y ' + names.slice(1).map((n) => n.toLowerCase()).join(' y ');
}
function byCode(a, b) {
  return String(a.code || '').localeCompare(String(b.code || ''), 'es', { numeric: true, sensitivity: 'base' });
}

export default function HorariosPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Roles que pueden abrir la página de Grupos (para navegar al tocar una clase).
  const canOpenGroup = ['ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'].includes(user?.role);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(null);
  const [profFilter, setProfFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

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

  const inTab = groups.filter((g) => {
    if (signature(g.days).join(',') !== activeTab) return false;
    if (profFilter && g.professor?.name !== profFilter) return false;
    if (levelFilter && g.ballLevel !== levelFilter) return false;
    return true;
  });

  // Franjas horarias: TODOS los grupos del día (con o sin cancha asignada)
  const times = [...new Set(inTab.map((g) => g.startTime))].sort((a, b) => a.localeCompare(b));

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page page-wide">
      <div className="page-content" style={{ paddingTop: 8 }}>
        <div className="flex items-center justify-between mb-2" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1>Horarios</h1>
            <p className="text-gray text-sm">Malla semanal por horarios</p>
          </div>
          <button className="btn btn-outline no-print" onClick={() => window.print()}>🖨 Imprimir</button>
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
        <div className="flex items-center gap-2 mb-2 no-print" style={{ flexWrap: 'wrap' }}>
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

        {/* Leyenda: estado de los estudiantes + niveles */}
        <div className="flex items-center gap-3 mb-3 text-xs text-gray" style={{ flexWrap: 'wrap' }}>
          <span><span className="legend-dot" style={{ background: ENROLLED_COLOR }} /> Matriculado</span>
          <span><span className="legend-dot" style={{ background: REGISTERED_COLOR }} /> Inscrito (pago pendiente)</span>
          <span style={{ opacity: 0.5 }}>|</span>
          {LEVELS.map((l) => (
            <span key={l}><span className="legend-dot" style={{ background: LEVEL_COLOR[l] }} /> {l}</span>
          ))}
        </div>

        {times.length === 0 ? (
          <div className="alert alert-info">No hay grupos para estos días con los filtros elegidos.</div>
        ) : (
          times.map((time) => {
            const gs = inTab.filter((g) => g.startTime === time).sort(byCode);
            return (
              <div key={time} className="mb-3">
                <div className="time-slot-header">🕐 {time}</div>
                <div className="card-grid">
                  {gs.map((g) => (
                    <div key={g.id} className={`card${canOpenGroup ? ' card-tap' : ''}`}
                      style={{ borderLeft: `4px solid ${LEVEL_COLOR[g.ballLevel] || 'var(--gray-300)'}` }}
                      onClick={canOpenGroup ? () => navigate('/admin/groups', { state: { focusCode: g.code } }) : undefined}
                      title={canOpenGroup ? 'Ver este grupo en Grupos' : undefined}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{g.code}{canOpenGroup && <span className="text-xs text-gray" style={{ fontWeight: 400 }}> ›</span>}</span>
                        <span className="text-xs text-gray">
                          {g.ballLevel && (
                            <span className="legend-dot" style={{ background: LEVEL_COLOR[g.ballLevel], marginRight: 4 }} />
                          )}
                          {g.ballLevel || ''}{g.subLevel ? ` ${g.subLevel}` : ''}
                        </span>
                      </div>
                      <div className="text-xs text-gray mb-1">
                        {g.professor?.name || '—'}
                        {g.court != null && ` · Cancha ${g.court}`}
                        {' · '}{g.startTime}–{g.endTime}
                      </div>
                      <div className="text-xs text-gray mb-1">{g.studentCount}/{g.capacity ?? 8} estudiantes</div>
                      <StudentList students={g.students} count={g.studentCount} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
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
      {students.map((s) => (
        <li key={s.id}>
          <span className="legend-dot" style={{
            background: s.paymentComplete ? ENROLLED_COLOR : REGISTERED_COLOR,
            width: 8, height: 8, marginRight: 5, flexShrink: 0,
          }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}
