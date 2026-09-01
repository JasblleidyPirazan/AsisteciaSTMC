import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';
import { StudentStatusIcon, STUDENT_STATUS } from '../../utils/studentStatus';
import { toast } from '../../utils/toast';

// Seguimiento de Estudiantes (Reportes → Estudiantes).
//
// Una fila por estudiante activo con el consumo de su paquete de clases en el
// semestre: adquiridas, asistencias, faltas, justificadas, N/A, reposiciones,
// clases caídas por lluvia y % de avance. Los datos vienen agregados de
// GET /reports/students-tracking (services/studentTracking.js).
//
// "Total" = clases consumidas del paquete. El interruptor "las faltas consumen
// clase" cambia el criterio sin recargar: encendido (por defecto) suma las
// ausencias — el estudiante pagó la clase y no vino; apagado cuenta solo lo
// efectivamente visto (asistencias + reposiciones).

// Semáforo del avance: al día = verde; atrasado = rojo.
function trafficColor(pct) {
  if (pct == null) return 'var(--gray-400)';
  if (pct >= 85) return 'var(--green)';
  if (pct >= 60) return 'var(--yellow)';
  return 'var(--red)';
}

function pctText(pct) {
  return pct == null ? '—' : `${pct}%`;
}

function SortTh({ label, col, sort, setSort, numeric, className, title }) {
  const active = sort.key === col;
  function toggle() {
    if (active) setSort({ key: col, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else setSort({ key: col, dir: numeric ? 'desc' : 'asc' });
  }
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕';
  return (
    <th className={className} title={title || 'Ordenar'} onClick={toggle}
      style={{ cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
      {label} <span style={{ opacity: active ? 1 : 0.35, fontSize: '0.75em' }}>{arrow}</span>
    </th>
  );
}

function PctBar({ pct }) {
  return (
    <div className="flex items-center gap-2">
      <div className="load-bar" style={{ flex: 1, minWidth: 40 }}>
        <span style={{ width: `${Math.min(100, pct || 0)}%`, background: trafficColor(pct) }} />
      </div>
      <span className="text-sm font-medium" style={{ color: trafficColor(pct), width: 46, textAlign: 'right' }}>
        {pctText(pct)}
      </span>
    </div>
  );
}

export default function StudentTracking() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [countAbsences, setCountAbsences] = useState(true);
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState(null); // { row, records, loading }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    api.get('/reports/students-tracking', params)
      .then((d) => { if (alive) setData(d); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [from, to]);

  const rows = data?.rows || [];

  // Total consumido y avance se derivan en el cliente para que el interruptor
  // de "las faltas consumen clase" no obligue a volver al servidor.
  const decorated = useMemo(() => rows.map((r) => {
    const total = r.present + r.makeup + (countAbsences ? r.absent : 0);
    return { ...r, total, pct: r.acquired ? Math.round((total / r.acquired) * 1000) / 10 : null };
  }), [rows, countAbsences]);

  const options = useMemo(() => ({
    groups: [...new Set(rows.map((r) => r.groupCode).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
    levels: [...new Set(rows.map((r) => r.groupLevel).filter(Boolean))].sort(),
  }), [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = decorated.filter((r) => {
      if (groupFilter && r.groupCode !== groupFilter) return false;
      if (levelFilter && r.groupLevel !== levelFilter) return false;
      if (statusFilter && r.studentStatus !== statusFilter) return false;
      if (needle && !`${r.name} ${r.document || ''} ${r.groupCode || ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const { key, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const va = a[key], vb = b[key];
      if (typeof va === 'number' || typeof vb === 'number') return ((va ?? -1) - (vb ?? -1)) * mul;
      return String(va || '').localeCompare(String(vb || ''), 'es', { numeric: true, sensitivity: 'base' }) * mul;
    });
  }, [decorated, q, groupFilter, levelFilter, statusFilter, sort]);

  const totals = useMemo(() => visible.reduce((t, r) => ({
    acquired: t.acquired + r.acquired, present: t.present + r.present, absent: t.absent + r.absent,
    justified: t.justified + r.justified, na: t.na + r.na, makeup: t.makeup + r.makeup,
    rain: t.rain + r.rain, holiday: t.holiday + r.holiday, total: t.total + r.total,
  }), { acquired: 0, present: 0, absent: 0, justified: 0, na: 0, makeup: 0, rain: 0, holiday: 0, total: 0 }), [visible]);
  const totalsPct = totals.acquired ? Math.round((totals.total / totals.acquired) * 1000) / 10 : null;

  const rangeLabel = data?.semester
    ? `${data.semester.name} · ${fmtDate(data.semester.startDate)} – ${fmtDate(data.semester.endDate)}`
    : (data?.from || data?.to)
      ? `${data.from ? fmtDate(data.from) : '…'} – ${data.to ? fmtDate(data.to) : '…'}`
      : 'Histórico completo (sin semestre activo)';

  async function exportExcel() {
    setExporting(true);
    try {
      const token = localStorage.getItem('stmc_token');
      const base = import.meta.env.VITE_API_URL || '/api';
      const qs = new URLSearchParams({ countAbsences: String(countAbsences) });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(`${base}/reports/students-tracking/export?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'seguimiento-estudiantes.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function openDetail(row) {
    setDetail({ row, records: [], loading: true });
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const d = await api.get(`/reports/student/${row.id}`, params);
      setDetail({ row, records: d.records || [], loading: false });
    } catch (err) {
      toast.error(err.message);
      setDetail({ row, records: [], loading: false });
    }
  }

  if (loading) return <div className="flex items-center justify-center" style={{ padding: 40 }}><div className="spinner" /></div>;
  if (error) return <div className="alert alert-error mt-3">{error}</div>;

  return (
    <div className="mt-3">
      {/* ===== Encabezado ===== */}
      <div className="flex items-center justify-between mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Seguimiento de Estudiantes</h2>
          <p className="text-xs text-gray" style={{ margin: '2px 0 0' }}>
            {rangeLabel} · {visible.length === rows.length
              ? `${rows.length} estudiantes`
              : `${visible.length} de ${rows.length} estudiantes`}
          </p>
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-outline" style={{ minHeight: 36, fontSize: '0.82rem', padding: '0 12px' }}
            onClick={() => printFichas(visible, { rangeLabel, countAbsences })}
            disabled={visible.length === 0}
            title="Abre las fichas listas para imprimir o guardar como PDF">
            🖨️ Fichas PDF ({visible.length})
          </button>
          <button className="btn btn-outline" style={{ minHeight: 36, fontSize: '0.82rem', padding: '0 12px' }}
            onClick={exportExcel} disabled={exporting}>
            {exporting ? 'Generando…' : '⬇️ Descargar Excel'}
          </button>
        </div>
      </div>

      {/* ===== Filtros ===== */}
      <div className="card mb-3">
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <input className="form-input" style={{ minHeight: 36, width: 'auto', flex: '1 1 180px', maxWidth: 320, fontSize: '0.85rem' }}
            placeholder="Buscar nombre o documento…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="form-input form-select" style={{ minHeight: 36, width: 'auto', fontSize: '0.85rem' }}
            value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">Todos los grupos</option>
            {options.groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="form-input form-select" style={{ minHeight: 36, width: 'auto', fontSize: '0.85rem' }}
            value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="">Todos los niveles</option>
            {options.levels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select className="form-input form-select" style={{ minHeight: 36, width: 'auto', fontSize: '0.85rem' }}
            value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(STUDENT_STATUS).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
          </select>
          {(q || groupFilter || levelFilter || statusFilter) && (
            <button className="btn btn-ghost" style={{ minHeight: 36, fontSize: '0.82rem', padding: '0 10px' }}
              onClick={() => { setQ(''); setGroupFilter(''); setLevelFilter(''); setStatusFilter(''); }}>
              Limpiar
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mt-3" style={{ flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <label className="form-label" style={{ margin: 0, fontSize: '0.75rem' }}>Desde</label>
            <input type="date" className="form-input" style={{ minHeight: 34, width: 'auto', maxWidth: 150, fontSize: '0.82rem' }}
              value={from} onChange={(e) => setFrom(e.target.value)} />
            <label className="form-label" style={{ margin: 0, fontSize: '0.75rem' }}>Hasta</label>
            <input type="date" className="form-input" style={{ minHeight: 34, width: 'auto', maxWidth: 150, fontSize: '0.82rem' }}
              value={to} onChange={(e) => setTo(e.target.value)} />
            {(from || to) && (
              <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem', padding: '0 10px' }}
                onClick={() => { setFrom(''); setTo(''); }}>Semestre activo</button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}
            title="Encendido: la falta sin justificar consume la clase (el estudiante la pagó y no vino). Apagado: solo cuenta lo efectivamente visto.">
            <input type="checkbox" checked={countAbsences} onChange={(e) => setCountAbsences(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
            Las faltas consumen clase
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="alert alert-info">Ningún estudiante coincide con los filtros.</div>
      ) : (
        <>
          {/* ===== Escritorio: tabla ===== */}
          <div className="only-desktop table-wrap">
            <table className="data-table tracking-table">
              <thead>
                <tr>
                  <SortTh label="Doc." col="document" sort={sort} setSort={setSort} title="Documento de identidad — ordenar" />
                  <SortTh label="Nombre" col="name" sort={sort} setSort={setSort} />
                  <SortTh label="Grupo" col="groupCode" sort={sort} setSort={setSort} />
                  <SortTh label="Adq." col="acquired" sort={sort} setSort={setSort} numeric className="num" title="Clases adquiridas (incluye las pendientes del semestre anterior)" />
                  <SortTh label="Asist." col="present" sort={sort} setSort={setSort} numeric className="num" title="Asistencias en clases regulares y festivales" />
                  <SortTh label="Aus." col="absent" sort={sort} setSort={setSort} numeric className="num" title="Faltas sin justificar (solo desde su fecha de inicio de clases)" />
                  <SortTh label="Just." col="justified" sort={sort} setSort={setSort} numeric className="num" title="Justificadas: nunca consumen clase" />
                  <SortTh label="N/A" col="na" sort={sort} setSort={setSort} numeric className="num" title="No aplica: el día no le corresponde (no consume clase)" />
                  <SortTh label="Rep." col="makeup" sort={sort} setSort={setSort} numeric className="num" title="Reposiciones a las que asistió" />
                  <SortTh label="Lluvia" col="rain" sort={sort} setSort={setSort} numeric className="num" title="Clases de sus grupos canceladas por lluvia" />
                  <SortTh label="Festivos" col="holiday" sort={sort} setSort={setSort} numeric className="num" title="Clases que no se dictaron porque el día cayó en una fecha excluida del semestre (festivo o vacaciones)" />
                  <SortTh label="Total" col="total" sort={sort} setSort={setSort} numeric className="num" title="Clases consumidas del paquete" />
                  <SortTh label="% Avance" col="pct" sort={sort} setSort={setSort} numeric title="Total consumido sobre clases adquiridas" />
                  <th style={{ textAlign: 'center' }}>Ficha</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => openDetail(r)} title="Ver el detalle de sus clases">
                    <td className="text-sm text-gray" style={{ whiteSpace: 'nowrap' }}>{r.document || '—'}</td>
                    <td className="font-medium" style={{ whiteSpace: 'nowrap' }}>
                      <StudentStatusIcon status={r.studentStatus} missingBirthDate={r.missingBirthDate} />
                      {r.name}
                    </td>
                    <td className="text-sm" style={{ whiteSpace: 'nowrap' }}>
                      {r.groupCode || <span className="text-gray">Sin grupo</span>}
                      {r.otherGroups.length > 0 && <span className="text-xs text-gray"> +{r.otherGroups.length}</span>}
                    </td>
                    <td className="num">{r.acquired || '—'}</td>
                    <td className="num" style={{ color: 'var(--green)', fontWeight: 600 }}>{r.present}</td>
                    <td className="num" style={{ color: r.absent > 0 ? 'var(--red)' : 'var(--gray-400)' }}>{r.absent || '—'}</td>
                    <td className="num" style={{ color: r.justified > 0 ? 'var(--blue)' : 'var(--gray-400)' }}>{r.justified || '—'}</td>
                    <td className="num text-gray">{r.na || '—'}</td>
                    <td className="num" style={{ color: r.makeup > 0 ? 'var(--brand-violet)' : 'var(--gray-400)' }}>{r.makeup || '—'}</td>
                    <td className="num" style={{ color: r.rain > 0 ? 'var(--brand-aqua)' : 'var(--gray-400)' }}>{r.rain || '—'}</td>
                    <td className="num" style={{ color: r.holiday > 0 ? 'var(--orange)' : 'var(--gray-400)' }}>{r.holiday || '—'}</td>
                    <td className="num font-medium">{r.total}</td>
                    <td style={{ minWidth: 100 }}><PctBar pct={r.pct} /></td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-ghost" style={{ minHeight: 30, padding: '0 8px', fontSize: '0.9rem' }}
                        title={`Ficha PDF de ${r.name}`}
                        onClick={(e) => { e.stopPropagation(); printFichas([r], { rangeLabel, countAbsences }); }}>
                        📄
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td></td>
                  <td>Total · {visible.length} estudiantes</td>
                  <td></td>
                  <td className="num">{totals.acquired}</td>
                  <td className="num">{totals.present}</td>
                  <td className="num">{totals.absent}</td>
                  <td className="num">{totals.justified}</td>
                  <td className="num">{totals.na}</td>
                  <td className="num">{totals.makeup}</td>
                  <td className="num">{totals.rain}</td>
                  <td className="num">{totals.holiday}</td>
                  <td className="num">{totals.total}</td>
                  <td><PctBar pct={totalsPct} /></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ===== Móvil: cards ===== */}
          <div className="only-mobile">
            {visible.map((r) => (
              <div key={r.id} className="card mb-2" onClick={() => openDetail(r)} style={{ cursor: 'pointer' }}>
                <div className="flex items-center justify-between" style={{ gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="font-medium">
                      <StudentStatusIcon status={r.studentStatus} missingBirthDate={r.missingBirthDate} />
                      {r.name}
                    </div>
                    <div className="text-xs text-gray">
                      {r.groupCode || 'Sin grupo'}{r.document ? ` · ${r.document}` : ''}
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ minHeight: 32, padding: '0 8px', flexShrink: 0 }}
                    title={`Ficha PDF de ${r.name}`}
                    onClick={(e) => { e.stopPropagation(); printFichas([r], { rangeLabel, countAbsences }); }}>
                    📄
                  </button>
                </div>
                <div className="text-xs text-gray mt-2">
                  Adq. {r.acquired || '—'} · Asist. {r.present} · Aus. {r.absent} · Just. {r.justified}
                  {r.na > 0 && ` · N/A ${r.na}`} · Rep. {r.makeup} · 🌧️ {r.rain}
                  {r.holiday > 0 && ` · 📅 ${r.holiday} festivos`}
                </div>
                <div className="mt-2">
                  <div className="text-xs text-gray mb-1">{r.total} de {r.acquired || '—'} clases consumidas</div>
                  <PctBar pct={r.pct} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-gray mt-3">
        Adq. = clases adquiridas (incluye las pendientes del semestre anterior) · Asist. = asistencias ·
        Aus. = faltas sin justificar, contadas solo desde su fecha de inicio de clases · Just. = justificadas (no consumen clase) ·
        N/A = el día no le corresponde · Rep. = reposiciones a las que asistió · Lluvia = clases de sus grupos canceladas por lluvia ·
        Festivos = clases que no se dictaron porque el día cayó en una fecha excluida del semestre (festivo o vacaciones) ·
        Total = clases consumidas del paquete{countAbsences ? ' (asistencias + faltas + reposiciones)' : ' (asistencias + reposiciones)'} ·
        % Avance = Total / Adq.
      </p>

      {detail && <StudentDetailModal detail={detail} rangeLabel={rangeLabel} countAbsences={countAbsences} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ─── Detalle de un estudiante (clase por clase) ────────────────────────────
const ATTENDANCE_LABEL = { PRESENTE: 'P', AUSENTE: 'A', JUSTIFICADA: 'J', NO_APLICA: 'N/A' };
const ATTENDANCE_COLOR = { PRESENTE: 'var(--green)', AUSENTE: 'var(--red)', JUSTIFICADA: 'var(--blue)', NO_APLICA: 'var(--gray-500)' };

function StudentDetailModal({ detail, rangeLabel, countAbsences, onClose }) {
  const { row, records, loading } = detail;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1" style={{ gap: 8 }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>
            <StudentStatusIcon status={row.studentStatus} missingBirthDate={row.missingBirthDate} />
            {row.name}
          </h2>
          <button className="btn btn-ghost" style={{ minHeight: 32, padding: '0 10px' }} onClick={onClose}>✕</button>
        </div>
        <p className="text-xs text-gray mb-3">
          {row.groupCode || 'Sin grupo'}{row.otherGroups.length > 0 ? ` · ${row.otherGroups.join(', ')}` : ''}
          {row.professor ? ` · ${row.professor}` : ''} · {rangeLabel}
        </p>

        <div className="stats-row mb-3">
          <div className="stat-box"><div className="num">{row.total}/{row.acquired || '—'}</div><div className="lbl">Consumidas</div></div>
          <div className="stat-box"><div className="num">{row.present}</div><div className="lbl">Asistencias</div></div>
          <div className="stat-box"><div className="num">{row.absent}</div><div className="lbl">Faltas</div></div>
          <div className="stat-box"><div className="num">{row.makeup}</div><div className="lbl">Reposiciones</div></div>
        </div>
        <PctBar pct={row.pct} />

        <div className="flex gap-2 mt-3 mb-3">
          <button className="btn btn-outline btn-full" style={{ minHeight: 36, fontSize: '0.82rem' }}
            onClick={() => printFichas([row], { rangeLabel, countAbsences })}>
            🖨️ Ficha PDF
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center" style={{ padding: 20 }}><div className="spinner" /></div>
        ) : records.length === 0 ? (
          <div className="alert alert-info">Sin registros de asistencia en el período.</div>
        ) : (
          <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
            {records.map((r) => (
              <div key={r.id} className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                <div>
                  <div className="text-sm">{fmtDate(r.session?.date)}</div>
                  <div className="text-xs text-gray">
                    {r.session?.group?.code || (r.session?.kind === 'MAKEUP' ? '🔁 Reposición' : r.session?.kind === 'FESTIVAL' ? '🎉 Festival' : '—')}
                    {r.attendanceType === 'REPOSICION' && r.session?.kind !== 'MAKEUP' && ' · reposición'}
                  </div>
                </div>
                <span style={{
                  fontWeight: 700, fontSize: '0.85rem', minWidth: 30, height: 30, borderRadius: 15, padding: '0 6px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: ATTENDANCE_COLOR[r.status] + '20', color: ATTENDANCE_COLOR[r.status],
                }}>
                  {ATTENDANCE_LABEL[r.status] || r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Fichas para imprimir / guardar como PDF ───────────────────────────────
// El navegador se encarga del PDF (Imprimir → Guardar como PDF), así que no
// hace falta ninguna librería: se arma un documento con una ficha por página
// dentro de un iframe oculto y se manda a imprimir.
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fichaHtml(r, rangeLabel, countAbsences) {
  const pct = r.pct == null ? null : r.pct;
  const barColor = pct == null ? '#8B96BE' : pct >= 85 ? '#1FA971' : pct >= 60 ? '#E8A23B' : '#E8526A';
  const cell = (label, value, color) =>
    `<div class="m"><div class="mv" style="color:${color}">${esc(value)}</div><div class="ml">${esc(label)}</div></div>`;

  return `<section class="ficha">
    <header>
      <div class="brand">🎾 STMC · Academia de Tenis</div>
      <div class="range">${esc(rangeLabel)}</div>
    </header>
    <h1>${esc(r.name)}</h1>
    <div class="sub">
      ${esc(r.groupCode || 'Sin grupo')}${r.otherGroups?.length ? ` · ${esc(r.otherGroups.join(', '))}` : ''}
      ${r.professor ? ` · Profesor: ${esc(r.professor)}` : ''}
      ${r.document ? ` · Documento: ${esc(r.document)}` : ''}
    </div>
    <div class="progress">
      <div class="ptitle">Avance del paquete de clases</div>
      <div class="bar"><span style="width:${Math.min(100, pct || 0)}%;background:${barColor}"></span></div>
      <div class="pfoot"><strong style="color:${barColor}">${pct == null ? '—' : pct + '%'}</strong>
        · ${r.total} de ${r.acquired || '—'} clases consumidas</div>
    </div>
    <div class="metrics">
      ${cell('Adquiridas', r.acquired || '—', '#141E45')}
      ${cell('Asistencias', r.present, '#1FA971')}
      ${cell('Faltas', r.absent, '#E8526A')}
      ${cell('Justificadas', r.justified, '#3F52A8')}
      ${cell('No aplica', r.na, '#7C8BA8')}
      ${cell('Reposiciones', r.makeup, '#7A5AF8')}
      ${cell('Por lluvia', r.rain, '#4F9FB2')}
      ${cell('Por festivos', r.holiday, '#E8A23B')}
      ${cell('Total consumidas', r.total, '#141E45')}
    </div>
    <p class="note">
      Total consumidas = asistencias${countAbsences ? ' + faltas' : ''} + reposiciones.
      Las justificadas y los días marcados "no aplica" no consumen clase.
      Las clases canceladas por lluvia y las que caen en festivos no se cobran del paquete.
    </p>
    <footer>Generado el ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</footer>
  </section>`;
}

export function printFichas(rows, { rangeLabel = '', countAbsences = true } = {}) {
  if (!rows || rows.length === 0) return;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Seguimiento de estudiantes</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #141E45; }
  .ficha { page-break-after: always; padding: 4mm 0; }
  .ficha:last-child { page-break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 2px solid #3F52A8; padding-bottom: 8px; margin-bottom: 18px; }
  .brand { font-weight: 700; color: #3F52A8; letter-spacing: 0.02em; }
  .range { font-size: 11px; color: #6F7BA6; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { font-size: 12px; color: #6F7BA6; margin-bottom: 22px; }
  .progress { background: #F4F6FC; border: 1px solid #E6EAF3; border-radius: 12px; padding: 14px 16px; margin-bottom: 18px; }
  .ptitle { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6F7BA6; margin-bottom: 8px; }
  .bar { height: 10px; border-radius: 99px; background: #E6EAF3; overflow: hidden; }
  .bar > span { display: block; height: 100%; border-radius: 99px; }
  .pfoot { font-size: 13px; margin-top: 8px; color: #3F4A6B; }
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .m { border: 1px solid #E6EAF3; border-radius: 10px; padding: 12px 10px; text-align: center; }
  .mv { font-size: 20px; font-weight: 700; line-height: 1; }
  .ml { font-size: 10px; color: #6F7BA6; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.04em; }
  .note { font-size: 10px; color: #8B96BE; margin-top: 18px; line-height: 1.5; }
  footer { font-size: 10px; color: #8B96BE; margin-top: 26px; border-top: 1px solid #E6EAF3; padding-top: 8px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>${rows.map((r) => fichaHtml(r, rangeLabel, countAbsences)).join('')}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';

  let removed = false;
  const cleanup = () => { if (!removed) { removed = true; iframe.remove(); } };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    win.addEventListener('afterprint', () => setTimeout(cleanup, 100));
    win.focus();
    win.print();
    // Red de seguridad: algunos navegadores no emiten "afterprint".
    setTimeout(cleanup, 60000);
  };

  // srcdoc en vez de document.write: el onload dispara con el contenido ya
  // renderizado, así no se manda a imprimir un documento vacío.
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
