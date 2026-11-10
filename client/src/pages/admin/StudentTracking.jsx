import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';
import { StudentStatusIcon, STUDENT_STATUS } from '../../utils/studentStatus';
import { SEMAFORO } from '../../utils/glossary';
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

// El color es el semáforo del servidor (el mismo de toda la app); sin semáforo, neutro
function PctBar({ pct, semaforo }) {
  const color = (SEMAFORO[semaforo] || { color: 'var(--brand-indigo)' }).color;
  return (
    <div className="flex items-center gap-2">
      <div className="load-bar" style={{ flex: 1, minWidth: 40 }}>
        <span style={{ width: `${Math.min(100, pct || 0)}%`, background: color }} />
      </div>
      <span className="text-sm font-medium" style={{ color, width: 46, textAlign: 'right' }}>
        {pctText(pct)}
      </span>
    </div>
  );
}

export default function StudentTracking() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState(null); // { row, records, loading }
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api.get('/reports/students-tracking')
      .then((d) => { if (alive) setData(d); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const rows = data?.rows || [];

  // Total consumido y % de avance vienen del servidor (ledger): la falta sin
  // justificar siempre consume la clase, así que ya no hay interruptor.
  const decorated = rows;

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
    rain: t.rain + r.rain, total: t.total + r.total,
  }), { acquired: 0, present: 0, absent: 0, justified: 0, na: 0, makeup: 0, rain: 0, total: 0 }), [visible]);
  const round1 = (n) => Math.round(n * 10) / 10;
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
      const res = await fetch(`${base}/reports/students-tracking/export`, { headers: { Authorization: `Bearer ${token}` } });
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

  // Rango efectivo de la tabla (el semestre activo si no se eligieron fechas):
  // el detalle clase a clase usa el mismo, para que cuadre con los totales.
  const detailParams = {};
  if (data?.from) detailParams.from = String(data.from).slice(0, 10);
  if (data?.to) detailParams.to = String(data.to).slice(0, 10);

  async function printWithDetail(list) {
    if (printing || list.length === 0) return;
    setPrinting(true);
    try {
      await printFichas(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPrinting(false);
    }
  }

  async function openDetail(row) {
    setDetail({ row, records: [], loading: true });
    try {
      const d = await api.get(`/reports/student/${row.id}`, detailParams);
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
            onClick={() => printWithDetail(visible)}
            disabled={visible.length === 0 || printing}
            title="Abre las fichas (con el detalle clase a clase) listas para imprimir o guardar como PDF">
            {printing ? 'Preparando fichas…' : `🖨️ Fichas PDF (${visible.length})`}
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

        <p className="text-xs text-gray mt-2" style={{ marginBottom: 0 }}>
          Semestre activo: desde su inicio hasta el inicio del siguiente semestre. La falta sin justificar siempre consume la clase.
        </p>
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
                  <SortTh label="Documento" col="document" sort={sort} setSort={setSort} />
                  <SortTh label="Nombre" col="name" sort={sort} setSort={setSort} />
                  <SortTh label="Grupo" col="groupCode" sort={sort} setSort={setSort} />
                  <SortTh label="Adq." col="acquired" sort={sort} setSort={setSort} numeric className="num" title="Clases adquiridas (incluye las pendientes del semestre anterior)" />
                  <SortTh label="Asist." col="present" sort={sort} setSort={setSort} numeric className="num" title="Asistencias en clases regulares y festivales" />
                  <SortTh label="Aus." col="absent" sort={sort} setSort={setSort} numeric className="num" title="Faltas sin justificar (solo desde su fecha de inicio de clases)" />
                  <SortTh label="Just." col="justified" sort={sort} setSort={setSort} numeric className="num" title="Justificadas: nunca consumen clase" />
                  <SortTh label="N/A" col="na" sort={sort} setSort={setSort} numeric className="num" title="No aplica: el día no le corresponde (no consume clase)" />
                  <SortTh label="Rep." col="makeup" sort={sort} setSort={setSort} numeric className="num" title="Reposiciones a las que asistió" />
                  <SortTh label="Lluvia" col="rain" sort={sort} setSort={setSort} numeric className="num" title="Clases de sus grupos canceladas por lluvia" />
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
                      {r.studentStatus === 'GRADUADO' && <span title="Graduado" style={{ marginLeft: 4 }}>🎓</span>}
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
                    <td className="num font-medium">{r.total}</td>
                    <td style={{ minWidth: 108 }}><PctBar pct={r.pct} semaforo={r.semaforo} /></td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-ghost" style={{ minHeight: 30, padding: '0 8px', fontSize: '0.9rem' }}
                        title={`Ficha PDF de ${r.name}`}
                        disabled={printing}
                        onClick={(e) => { e.stopPropagation(); printWithDetail([r]); }}>
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
                  <td className="num">{round1(totals.makeup)}</td>
                  <td className="num">{totals.rain}</td>
                  <td className="num">{round1(totals.total)}</td>
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
                      {r.studentStatus === 'GRADUADO' && <span title="Graduado" style={{ marginLeft: 4 }}>🎓</span>}
                    </div>
                    <div className="text-xs text-gray">
                      {r.groupCode || 'Sin grupo'}{r.document ? ` · ${r.document}` : ''}
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ minHeight: 32, padding: '0 8px', flexShrink: 0 }}
                    title={`Ficha PDF de ${r.name}`}
                    disabled={printing}
                        onClick={(e) => { e.stopPropagation(); printWithDetail([r]); }}>
                    📄
                  </button>
                </div>
                <div className="text-xs text-gray mt-2">
                  Adq. {r.acquired || '—'} · Asist. {r.present} · Aus. {r.absent} · Just. {r.justified}
                  {r.na > 0 && ` · N/A ${r.na}`} · Rep. {r.makeup} · 🌧️ {r.rain}
                </div>
                <div className="mt-2">
                  <div className="text-xs text-gray mb-1">{r.total} de {r.acquired || '—'} clases consumidas</div>
                  <PctBar pct={r.pct} semaforo={r.semaforo} />
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
        Total = clases consumidas del paquete (asistencias + faltas + reposiciones) ·
        % Avance = Total / Adq.
      </p>

      {detail && (
        <StudentDetailModal detail={detail} rangeLabel={rangeLabel} printing={printing} onClose={() => setDetail(null)}
          onPrint={() => printWithDetail([detail.row])} />
      )}
    </div>
  );
}

// ─── Detalle de un estudiante (clase por clase) ────────────────────────────
const ATTENDANCE_LABEL = { PRESENTE: 'P', AUSENTE: 'A', JUSTIFICADA: 'J', NO_APLICA: 'N/A' };
const ATTENDANCE_COLOR = { PRESENTE: 'var(--green)', AUSENTE: 'var(--red)', JUSTIFICADA: 'var(--blue)', NO_APLICA: 'var(--gray-500)' };

function StudentDetailModal({ detail, rangeLabel, printing, onPrint, onClose }) {
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
        <PctBar pct={row.pct} semaforo={row.semaforo} />

        <div className="flex gap-2 mt-3 mb-3">
          <button className="btn btn-outline btn-full" style={{ minHeight: 36, fontSize: '0.82rem' }}
            disabled={loading || printing} onClick={onPrint}>
            {printing ? 'Preparando ficha…' : '🖨️ Ficha PDF'}
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
// El servidor arma las fichas con el mismo contenido del correo semanal de
// avance (POST /reports/students/fichas → services/progressEmail.js), así la
// ficha y el correo dicen exactamente lo mismo. El navegador hace el PDF
// (Imprimir → Guardar como PDF): se carga el documento en un iframe oculto y se
// manda a imprimir. Se pide en tandas de 100 para no armar respuestas enormes.
const FICHAS_BATCH = 100;

export async function printFichas(list) {
  if (!list || list.length === 0) return;
  const ids = list.map((r) => r.id);
  let html = '';
  for (let i = 0; i < ids.length; i += FICHAS_BATCH) {
    const data = await api.post('/reports/students/fichas', { studentIds: ids.slice(i, i + FICHAS_BATCH) });
    // Une las tandas: el cuerpo de cada documento va dentro del primero
    if (!html) html = data.html;
    else html = html.replace('</body>', `${data.html.split('<body>')[1].split('</body>')[0]}</body>`);
  }

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
