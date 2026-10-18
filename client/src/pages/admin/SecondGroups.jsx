import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';
import { StudentStatusIcon } from '../../utils/studentStatus';
import { toast } from '../../utils/toast';

// Otros grupos (Reportes → Otros grupos).
//
// Estudiantes que asisten a un grupo distinto de su grupo principal: a cuál,
// qué días, cuántas veces, en cuántas semanas y desde qué fecha. Sale de la
// asistencia real del sistema (GET /reports/second-groups). "Regular" =
// mínimo de veces y de semanas distintas, ajustable aquí sin recargar.

export default function SecondGroups() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [minVisits, setMinVisits] = useState(3);
  const [minWeeks, setMinWeeks] = useState(2);
  const [onlyRegular, setOnlyRegular] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    api.get('/reports/second-groups', params)
      .then((d) => { if (alive) setData(d); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [from, to]);

  const rows = useMemo(() => (data?.rows || []).map((r) => ({
    ...r, regular: r.visits >= minVisits && r.weeks >= minWeeks,
  })), [data, minVisits, minWeeks]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyRegular && !r.regular) return false;
      if (needle && !`${r.name} ${r.document || ''} ${r.mainGroupCode || ''} ${r.groupCode || ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, onlyRegular]);

  const regularCount = rows.filter((r) => r.regular).length;
  const notEnrolled = rows.filter((r) => r.regular && !r.enrolled).length;

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
      const qs = new URLSearchParams({ minVisits: String(minVisits), minWeeks: String(minWeeks) });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(`${base}/reports/second-groups/export?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'estudiantes-otros-grupos.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center" style={{ padding: 40 }}><div className="spinner" /></div>;
  if (error) return <div className="alert alert-error mt-3">{error}</div>;

  const numInput = { width: 56, minHeight: 34, padding: '0 6px' };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Estudiantes en otros grupos</h2>
          <p className="text-xs text-gray" style={{ margin: '2px 0 0' }}>
            {rangeLabel} · {regularCount} asisten regularmente a otro grupo
            {notEnrolled > 0 && <> · <strong>{notEnrolled} sin inscribir en ese grupo</strong></>}
          </p>
        </div>
        <button className="btn btn-outline" style={{ minHeight: 36, fontSize: '0.82rem', padding: '0 12px' }}
          onClick={exportExcel} disabled={exporting}>
          {exporting ? 'Generando…' : '⬇️ Descargar Excel'}
        </button>
      </div>

      <div className="card mb-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="form-label">Regular desde</label>
          <div className="flex items-center gap-2 text-sm">
            <input type="number" min="1" className="form-input" style={numInput}
              value={minVisits} onChange={(e) => setMinVisits(Math.max(1, Number(e.target.value) || 1))} />
            veces en
            <input type="number" min="1" className="form-input" style={numInput}
              value={minWeeks} onChange={(e) => setMinWeeks(Math.max(1, Number(e.target.value) || 1))} />
            semanas
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ minHeight: 34 }}>
          <input type="checkbox" checked={onlyRegular} onChange={(e) => setOnlyRegular(e.target.checked)} />
          Solo regulares
        </label>
        <div>
          <label className="form-label">Desde</label>
          <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Hasta</label>
          <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <input className="form-input" style={{ flex: 1, minWidth: 160 }} placeholder="Buscar estudiante o grupo…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {visible.length === 0 ? (
        <div className="card text-sm text-gray">
          {rows.length === 0
            ? 'Ningún estudiante ha asistido a un grupo distinto del suyo en este período.'
            : 'Nadie cumple el criterio de regularidad. Baja el mínimo o desmarca "Solo regulares".'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Su grupo</th>
                <th>Asiste a</th>
                <th>Días</th>
                <th title="Clases a las que asistió en ese grupo">Veces</th>
                <th title="Semanas distintas con asistencia">Sem.</th>
                <th>Desde</th>
                <th>Última</th>
                <th>Inscrito ahí</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.studentId}-${r.groupId}`}>
                  <td>
                    <StudentStatusIcon status={r.studentStatus} /> {r.name}
                    {r.document && <div className="text-xs text-gray">{r.document}</div>}
                  </td>
                  <td>{r.mainGroupCode || '—'}</td>
                  <td>
                    <strong>{r.groupCode}</strong>
                    {r.professor && <div className="text-xs text-gray">{r.professor}</div>}
                  </td>
                  <td>{r.weekdays.join(', ') || '—'}</td>
                  <td>{r.visits}</td>
                  <td>{r.weeks}</td>
                  <td>{r.firstDate ? fmtDate(r.firstDate) : '—'}</td>
                  <td>{r.lastDate ? fmtDate(r.lastDate) : '—'}</td>
                  <td>
                    {r.enrolled
                      ? <span className="badge badge-green">{r.enrollmentType === 'SECONDARY' ? 'Secundario' : 'Principal'}{r.enrolledAt ? ` · ${fmtDate(r.enrolledAt)}` : ''}</span>
                      : <span className="badge badge-yellow">No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
