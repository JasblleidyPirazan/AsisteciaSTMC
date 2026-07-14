import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

const DAYS = [
  { key: 'lunes', label: 'Lun' },
  { key: 'martes', label: 'Mar' },
  { key: 'miercoles', label: 'Mié' },
  { key: 'jueves', label: 'Jue' },
  { key: 'viernes', label: 'Vie' },
  { key: 'sabado', label: 'Sáb' },
  { key: 'domingo', label: 'Dom' },
];
const DAY_TOGGLE = [
  { key: 'lunes', label: 'L' }, { key: 'martes', label: 'M' }, { key: 'miercoles', label: 'X' },
  { key: 'jueves', label: 'J' }, { key: 'viernes', label: 'V' }, { key: 'sabado', label: 'S' }, { key: 'domingo', label: 'D' },
];

// Niveles y sus subniveles (definición del cliente).
const LEVELS = {
  Roja: ['A', 'B', 'C'],
  Naranja: ['A', 'B', 'C'],
  Verde: ['A', 'B', 'C'],
  Amarilla: ['Principiante', 'Intermedio', 'Avanzado'],
};
const BALL_COLOR = { Roja: '#E8526A', Naranja: '#EA8A2E', Verde: '#1FA971', Amarilla: '#E8A23B' };

const EMPTY_FORM = {
  code: '', professorId: '', startTime: '15:00', endTime: '15:45',
  court: '', capacity: 8, ballLevel: '', subLevel: '',
  lunes: false, martes: false, miercoles: false, jueves: false,
  viernes: false, sabado: false, domingo: false,
};

function daysText(g) {
  return DAYS.filter((d) => g[d.key]).map((d) => d.label).join(', ');
}

// deactivatedAt es un timestamp; se formatea en UTC para no correr el día.
function fmtDeactivated(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function GroupsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // CRUD de grupos: ADMIN / SUPERADMIN / Coordinador (PHYSICAL_TRAINER)
  const canEdit = ['ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER'].includes(user?.role);
  // Borrado permanente: solo Admin y Superadmin.
  const canHardDelete = ['ADMIN', 'SUPERADMIN'].includes(user?.role);
  const [groups, setGroups] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [filterLevel, setFilterLevel] = useState('');
  const [filterProfessor, setFilterProfessor] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterTime, setFilterTime] = useState('');
  const [sort, setSort] = useState({ key: 'startTime', dir: 'asc' });
  const [exporting, setExporting] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  const [hardDelTarget, setHardDelTarget] = useState(null);
  const [hardDelText, setHardDelText] = useState('');
  const [hardDeleting, setHardDeleting] = useState(false);

  async function confirmHardDeleteGroup() {
    if (hardDelText.trim().toLowerCase() !== hardDelTarget.code.trim().toLowerCase()) return;
    setHardDeleting(true);
    try {
      await api.delete(`/groups/${hardDelTarget.id}/permanent`, { confirm: true });
      setGroups(groups.filter((g) => g.id !== hardDelTarget.id));
      setHardDelTarget(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setHardDeleting(false);
    }
  }

  useEffect(() => {
    Promise.all([
      api.get('/groups', { active: 'all' }),
      api.get('/professors', { active: 'true' }),
    ]).then(([g, p]) => { setGroups(g); setProfessors(p); }).finally(() => setLoading(false));
  }, []);

  function setField(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function toggleDay(key) { setForm((f) => ({ ...f, [key]: !f[key] })); }

  const active = useMemo(() => groups.filter((g) => g.active), [groups]);
  const inactive = useMemo(() => groups.filter((g) => !g.active), [groups]);
  const summary = useMemo(() => ({
    activos: active.length,
    inactivos: inactive.length,
    canchas: new Set(active.map((g) => g.court).filter((c) => c != null)).size,
  }), [active, inactive]);

  const professorOptions = useMemo(
    () => [...new Set(active.map((g) => g.professor?.name).filter(Boolean))].sort(),
    [active]);
  const timeOptions = useMemo(
    () => [...new Set(active.map((g) => g.startTime).filter(Boolean))].sort(),
    [active]);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }
  function sortArrow(key) {
    if (sort.key !== key) return '';
    return sort.dir === 'asc' ? ' ▲' : ' ▼';
  }

  const visible = useMemo(() => {
    const base = showInactive ? inactive : active;
    const q = search.trim().toLowerCase();
    let out = base.filter((g) => {
      if (q && ![g.code, g.professor?.name, g.ballLevel, g.subLevel, g.court && `cancha ${g.court}`]
        .filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
      if (!showInactive) {
        if (filterLevel && g.ballLevel !== filterLevel) return false;
        if (filterProfessor && g.professor?.name !== filterProfessor) return false;
        if (filterDay && !g[filterDay]) return false;
        if (filterTime && g.startTime !== filterTime) return false;
      }
      return true;
    });
    if (!showInactive) {
      const { key, dir } = sort;
      const val = (g) => {
        if (key === 'professor') return g.professor?.name || '';
        if (key === 'court') return g.court ?? 999;
        if (key === 'ballLevel') return g.ballLevel || '';
        return g[key] ?? '';
      };
      out = [...out].sort((a, b) => {
        const va = val(a); const vb = val(b);
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return out;
  }, [active, inactive, showInactive, search, filterLevel, filterProfessor, filterDay, filterTime, sort]);

  function closeForm() { setShowForm(false); setForm(EMPTY_FORM); setEditingId(null); setError(''); }

  function startCreate() { setEditingId(null); setForm(EMPTY_FORM); setError(''); setShowForm(true); }

  function startEdit(g) {
    setEditingId(g.id);
    setForm({
      code: g.code, professorId: g.professorId,
      startTime: g.startTime, endTime: g.endTime,
      court: g.court ?? '', capacity: g.capacity ?? 8,
      ballLevel: g.ballLevel || '', subLevel: g.subLevel || '',
      lunes: g.lunes, martes: g.martes, miercoles: g.miercoles, jueves: g.jueves,
      viernes: g.viernes, sabado: g.sabado, domingo: g.domingo,
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (editingId) {
        const g = await api.put(`/groups/${editingId}`, form);
        setGroups(groups.map((x) => (x.id === editingId ? g : x)));
      } else {
        const g = await api.post('/groups', form);
        setGroups([...groups, g]);
      }
      closeForm();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function handleReactivate(g) {
    try {
      const updated = await api.put(`/groups/${g.id}`, { active: true });
      setGroups(groups.map((x) => (x.id === g.id ? updated : x)));
    } catch (err) { alert(err.message); }
  }

  async function confirmDeactivate() {
    if (!deactivateReason.trim()) return;
    setDeactivating(true);
    try {
      await api.delete(`/groups/${deactivateTarget.id}`, { reason: deactivateReason.trim() });
      setGroups(groups.map((g) => (g.id === deactivateTarget.id ? { ...g, active: false } : g)));
      setDeactivateTarget(null);
    } catch (err) { alert(err.message); } finally { setDeactivating(false); }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const token = localStorage.getItem('stmc_token');
      const base = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${base}/groups/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'grupos.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); } finally { setExporting(false); }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  const subOptions = LEVELS[form.ballLevel] || null;

  function OccBar({ g }) {
    const enrolled = g._count?.enrollments ?? 0;
    const cap = g.capacity || 8;
    const pct = Math.min(100, Math.round((enrolled / cap) * 100));
    // El color de la barra sigue el nivel del grupo (como el mockup).
    const color = BALL_COLOR[g.ballLevel] || 'var(--brand-indigo)';
    return (
      <div className="flex items-center gap-2">
        <div className="load-bar" style={{ width: 90 }}><span style={{ width: `${pct}%`, background: color }} /></div>
        <span className="text-xs text-gray" style={{ whiteSpace: 'nowrap' }}>{enrolled}/{cap}</span>
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <div style={{ flex: 1 }}>
          <h1>Grupos</h1>
          <p className="text-xs text-gray">{summary.activos} grupos activos en {summary.canchas} canchas</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && (
            <button className="btn btn-primary" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
              onClick={startCreate}>+ Agregar grupo</button>
          )}
          <button className="btn btn-outline" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
            onClick={handleExport} disabled={exporting}>{exporting ? '...' : '⬇ Exportar Excel'}</button>
        </div>
      </div>

      <div className="page-content">
        {/* Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }} className="mb-3">
          <div className="stat-box"><div className="num">{summary.activos}</div><div className="lbl">Activos</div></div>
          <div className="stat-box"><div className="num" style={{ color: 'var(--gray-400)' }}>{summary.inactivos}</div><div className="lbl">Inactivos</div></div>
          <div className="stat-box"><div className="num" style={{ color: 'var(--brand-aqua)' }}>{summary.canchas}</div><div className="lbl">Canchas</div></div>
        </div>

        <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
          <button className={`btn ${!showInactive ? 'btn-primary' : 'btn-outline'}`}
            style={{ minHeight: 34, padding: '0 12px', fontSize: '0.85rem' }}
            onClick={() => setShowInactive(false)}>Activos ({summary.activos})</button>
          <button className={`btn ${showInactive ? 'btn-primary' : 'btn-outline'}`}
            style={{ minHeight: 34, padding: '0 12px', fontSize: '0.85rem' }}
            onClick={() => setShowInactive(true)}>Desactivados ({summary.inactivos})</button>
        </div>

        {showInactive && (
          <div className="alert alert-info mb-3">
            Los grupos desactivados conservan su historial de clases y asistencias. Puedes reactivarlos cuando quieras.
          </div>
        )}

        <div className="flex items-center justify-between mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
          <input className="form-input" style={{ maxWidth: 320 }} placeholder="🔎 Filtrar filas..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="text-xs text-gray">{visible.length} / {(showInactive ? inactive : active).length} filas</span>
        </div>

        {!showInactive && (
          <div className="mb-3" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Niveles */}
            <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
              <button className={`chip ${!filterLevel ? 'chip-active' : ''}`} onClick={() => setFilterLevel('')}>Todos</button>
              {Object.keys(LEVELS).map((lvl) => (
                <button key={lvl} className={`chip ${filterLevel === lvl ? 'chip-active' : ''}`}
                  onClick={() => setFilterLevel(filterLevel === lvl ? '' : lvl)}>
                  <span className="legend-dot" style={{ background: BALL_COLOR[lvl] }} /> {lvl}
                </button>
              ))}
            </div>
            {/* Días */}
            <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
              <button className={`chip ${!filterDay ? 'chip-active' : ''}`} onClick={() => setFilterDay('')}>Todos los días</button>
              {DAY_TOGGLE.map((d) => (
                <button key={d.key} className={`chip ${filterDay === d.key ? 'chip-active' : ''}`}
                  onClick={() => setFilterDay(filterDay === d.key ? '' : d.key)}>{d.label}</button>
              ))}
            </div>
            {/* Profesor + horario */}
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              <select className="form-input form-select" style={{ minHeight: 34, width: 'auto', fontSize: '0.85rem' }}
                value={filterProfessor} onChange={(e) => setFilterProfessor(e.target.value)}>
                <option value="">Todos los profesores</option>
                {professorOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="form-input form-select" style={{ minHeight: 34, width: 'auto', fontSize: '0.85rem' }}
                value={filterTime} onChange={(e) => setFilterTime(e.target.value)}>
                <option value="">Todos los horarios</option>
                {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {(filterLevel || filterProfessor || filterDay || filterTime) && (
                <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem' }}
                  onClick={() => { setFilterLevel(''); setFilterProfessor(''); setFilterDay(''); setFilterTime(''); }}>
                  ✕ Limpiar filtros
                </button>
              )}
            </div>
          </div>
        )}

        {showForm && (
          <div className="card mb-4">
            <h3 className="mb-3">{editingId ? 'Editar grupo' : 'Nuevo grupo'}</h3>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Código *</label>
                <input type="text" className="form-input" required placeholder="Ej: LM1314"
                  value={form.code} onChange={(e) => setField('code', e.target.value)} maxLength={100} />
              </div>
              <div className="form-group">
                <label className="form-label">Profesor *</label>
                <select className="form-input form-select" required value={form.professorId}
                  onChange={(e) => setField('professorId', e.target.value)}>
                  <option value="">Seleccionar profesor</option>
                  {professors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Días</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {DAY_TOGGLE.map((d) => (
                    <button key={d.key} type="button" onClick={() => toggleDay(d.key)}
                      style={{
                        width: 40, height: 40, borderRadius: '50%', border: '2px solid',
                        borderColor: form[d.key] ? 'var(--primary)' : 'var(--gray-300)',
                        background: form[d.key] ? 'var(--primary)' : 'transparent',
                        color: form[d.key] ? '#fff' : 'var(--gray-500)', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
                      }}>{d.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Inicio *</label>
                  <input type="time" className="form-input" required value={form.startTime}
                    onChange={(e) => setField('startTime', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fin *</label>
                  <input type="time" className="form-input" required value={form.endTime}
                    onChange={(e) => setField('endTime', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Cancha</label>
                  <input type="number" className="form-input" min={1} max={20}
                    value={form.court} onChange={(e) => setField('court', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cupo máximo *</label>
                  <input type="number" className="form-input" min={1} max={30} required
                    value={form.capacity} onChange={(e) => setField('capacity', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Nivel</label>
                  <select className="form-input form-select" value={form.ballLevel}
                    onChange={(e) => setForm((f) => ({ ...f, ballLevel: e.target.value, subLevel: '' }))}>
                    <option value="">Sin especificar</option>
                    {/* Valor histórico que ya no está en el catálogo: se muestra para no perderlo */}
                    {form.ballLevel && !LEVELS[form.ballLevel] && (
                      <option value={form.ballLevel}>{form.ballLevel} (anterior)</option>
                    )}
                    {Object.keys(LEVELS).map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Subnivel</label>
                  <select className="form-input form-select" value={form.subLevel}
                    disabled={!subOptions && !form.subLevel}
                    onChange={(e) => setField('subLevel', e.target.value)}>
                    <option value="">{subOptions ? 'Sin subnivel' : 'Elige un nivel primero'}</option>
                    {/* Subnivel histórico inválido para el nivel actual: visible, y al guardar sin cambiarlo se conserva */}
                    {form.subLevel && !(subOptions || []).includes(form.subLevel) && (
                      <option value={form.subLevel}>{form.subLevel} (anterior)</option>
                    )}
                    {(subOptions || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={closeForm}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                  {saving ? 'Guardando...' : (editingId ? 'Guardar cambios' : 'Crear grupo')}
                </button>
              </div>
            </form>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="alert alert-info">No hay grupos que coincidan.</div>
        ) : showInactive ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Grupo</th><th>Nivel</th><th>Subnivel</th><th>Profesor</th>
                  <th>Desactivado el</th><th>Motivo</th>{canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((g) => (
                  <tr key={g.id}>
                    <td><span className="badge badge-gray" style={{ fontFamily: 'monospace' }}>{g.code}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {g.ballLevel ? (
                        <><span className="legend-dot" style={{ background: BALL_COLOR[g.ballLevel] || 'var(--gray-400)' }} /> {g.ballLevel}</>
                      ) : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{g.subLevel || '—'}</td>
                    <td>{g.professor?.name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDeactivated(g.deactivatedAt)}</td>
                    <td className="text-sm text-gray">{g.deactivationReason || '—'}</td>
                    {canEdit && (
                      <td className="num">
                        <button className="btn btn-ghost" style={{ minHeight: 28, padding: '0 8px', fontSize: '0.72rem', color: 'var(--green)' }}
                          onClick={() => handleReactivate(g)}>Reactivar</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="clickable" onClick={() => toggleSort('code')}>Grupo{sortArrow('code')}</th>
                  <th>Días</th>
                  <th className="clickable" onClick={() => toggleSort('startTime')}>Hora{sortArrow('startTime')}</th>
                  <th className="clickable" onClick={() => toggleSort('professor')}>Profesor{sortArrow('professor')}</th>
                  <th className="clickable" onClick={() => toggleSort('court')}>Cancha{sortArrow('court')}</th>
                  <th className="clickable" onClick={() => toggleSort('ballLevel')}>Nivel{sortArrow('ballLevel')}</th>
                  <th className="clickable" onClick={() => toggleSort('subLevel')}>Subnivel{sortArrow('subLevel')}</th>
                  <th>Ocupación</th>{canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((g) => (
                  <tr key={g.id}>
                    <td><span className="badge badge-gray" style={{ fontFamily: 'monospace' }}>{g.code}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{daysText(g) || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{g.startTime} – {g.endTime}</td>
                    <td>{g.professor?.name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{g.court ? `Cancha ${g.court}` : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {g.ballLevel ? (
                        <><span className="legend-dot" style={{ background: BALL_COLOR[g.ballLevel] || 'var(--gray-400)' }} /> {g.ballLevel}</>
                      ) : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{g.subLevel || '—'}</td>
                    <td><OccBar g={g} /></td>
                    {canEdit && (
                      <td className="num">
                        <div className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost" style={{ minHeight: 28, padding: '0 8px', fontSize: '0.72rem' }}
                            onClick={() => startEdit(g)}>Editar</button>
                          <button className="btn btn-ghost" style={{ minHeight: 28, padding: '0 8px', fontSize: '0.72rem', color: 'var(--red)' }}
                            onClick={() => { setDeactivateTarget(g); setDeactivateReason(''); }}>Desactivar</button>
                          {canHardDelete && (
                            <button className="btn btn-ghost" style={{ minHeight: 28, padding: '0 8px', fontSize: '0.72rem', color: 'var(--red)', fontWeight: 700 }}
                              onClick={() => { setHardDelTarget(g); setHardDelText(''); }}>Eliminar</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deactivateTarget && (
        <div className="modal-overlay" onClick={() => setDeactivateTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3">Desactivar grupo</h3>
            <p className="text-sm mb-3">
              Vas a desactivar el grupo <strong>{deactivateTarget.code}</strong>. Esta acción requiere un motivo.
            </p>
            <div className="form-group">
              <label className="form-label">Motivo *</label>
              <textarea className="form-input" rows={3} placeholder="Ej: Fin de semestre, grupo disuelto..."
                value={deactivateReason} onChange={(e) => setDeactivateReason(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div className="flex gap-2 mt-2">
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setDeactivateTarget(null)}>Cancelar</button>
              <button className="btn" style={{ flex: 2, background: 'var(--red)', color: '#fff' }}
                disabled={!deactivateReason.trim() || deactivating} onClick={confirmDeactivate}>
                {deactivating ? 'Desactivando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {hardDelTarget && (
        <div className="modal-overlay" onClick={() => setHardDelTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2" style={{ color: 'var(--red)' }}>Eliminar grupo definitivamente</h3>
            <div className="alert alert-error mb-3">
              Esto borra el grupo <strong>{hardDelTarget.code}</strong> con sus matrículas y
              <strong> todas sus clases</strong> (asistencia, reportes, costos). <strong>No se puede deshacer.</strong>
            </div>
            <div className="form-group">
              <label className="form-label">Escribe el código del grupo para confirmar</label>
              <input type="text" className="form-input" value={hardDelText} autoFocus
                placeholder={hardDelTarget.code}
                onChange={(e) => setHardDelText(e.target.value)} />
            </div>
            <div className="flex gap-2 mt-2">
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setHardDelTarget(null)}>Cancelar</button>
              <button className="btn" style={{ flex: 2, background: 'var(--red)', color: '#fff' }}
                disabled={hardDeleting || hardDelText.trim().toLowerCase() !== hardDelTarget.code.trim().toLowerCase()}
                onClick={confirmHardDeleteGroup}>
                {hardDeleting ? 'Eliminando…' : 'Eliminar para siempre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
