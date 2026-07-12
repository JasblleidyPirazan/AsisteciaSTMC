import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { fmtDate } from '../utils/dates';

const LEVEL_COLOR = {
  Roja: '#E8526A', Naranja: '#EA8A2E', Amarilla: '#E8A23B', Verde: '#1FA971',
  Intermedio: '#7A5AF8', Avanzado: '#3F52A8',
};

const STATUS_BADGE = {
  PRESENTE: ['badge-green', 'Presente'],
  AUSENTE: ['badge-red', 'Ausente'],
  JUSTIFICADA: ['badge-yellow', 'Justificada'],
};

export default function ReportePage() {
  const navigate = useNavigate();
  const [data, setData] = useState({ rows: [], totals: {}, options: { groups: [], levels: [], students: [] } });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: '', to: '', level: '', groupId: '', studentId: '' });

  // Detalle de una sesión (modal): asistencia P/A/J por estudiante.
  const [detailRow, setDetailRow] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  function openDetail(row) {
    setDetailRow(row);
    setDetail(null);
    setDetailLoading(true);
    api.get(`/reports/class/${row.sessionId}`)
      .then(setDetail)
      .catch(() => setDetail({ error: true }))
      .finally(() => setDetailLoading(false));
  }

  useEffect(() => {
    setLoading(true);
    const params = {};
    for (const [k, v] of Object.entries(filters)) if (v) params[k] = v;
    api.get('/reports/class-log', params)
      .then((d) => setData(d || { rows: [], totals: {}, options: { groups: [], levels: [], students: [] } }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters]);

  function set(k, v) { setFilters((f) => ({ ...f, [k]: v })); }
  function clearFilters() { setFilters({ from: '', to: '', level: '', groupId: '', studentId: '' }); }

  const { rows, totals, options } = data;
  const hasFilters = Object.values(filters).some(Boolean);

  // Acumulado corriente (las filas vienen ordenadas por fecha ascendente)
  let accP = 0, accTot = 0;
  const withAcc = rows.map((r) => {
    accP += r.present; accTot += r.total;
    return { ...r, accPresent: accP, accTotal: accTot };
  });

  return (
    <div className="page page-wide">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/')}>←</button>
        <h1>Reporte de clases</h1>
      </div>

      <div className="page-content">
        <p className="text-sm text-gray mb-3">
          Una fila por clase reportada con la cantidad de estudiantes por estado. El acumulado suma
          las clases en orden de fecha.
        </p>

        {/* Filtros */}
        <div className="card mb-3">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Desde</label>
              <input type="date" className="form-input" value={filters.from} onChange={(e) => set('from', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Hasta</label>
              <input type="date" className="form-input" value={filters.to} onChange={(e) => set('to', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nivel</label>
              <select className="form-input form-select" value={filters.level} onChange={(e) => set('level', e.target.value)}>
                <option value="">Todos</option>
                {options.levels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Grupo</label>
              <select className="form-input form-select" value={filters.groupId} onChange={(e) => set('groupId', e.target.value)}>
                <option value="">Todos</option>
                {options.groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Estudiante</label>
              <select className="form-input form-select" value={filters.studentId} onChange={(e) => set('studentId', e.target.value)}>
                <option value="">Todos</option>
                {options.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          {hasFilters && (
            <button className="btn btn-ghost mt-2" style={{ minHeight: 32, fontSize: '0.8rem' }} onClick={clearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Resumen acumulado */}
        <div className="home-kpis mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <div className="card"><div className="kpi-lbl">Clases</div><div className="kpi-num">{totals.classes || 0}</div></div>
          <div className="card"><div className="kpi-lbl">Presentes</div><div className="kpi-num" style={{ color: 'var(--green)' }}>{totals.present || 0}</div></div>
          <div className="card"><div className="kpi-lbl">Ausentes</div><div className="kpi-num" style={{ color: 'var(--red)' }}>{totals.absent || 0}</div></div>
          <div className="card"><div className="kpi-lbl">Justificadas</div><div className="kpi-num" style={{ color: 'var(--yellow)' }}>{totals.justified || 0}</div></div>
        </div>

        {loading ? <div className="spinner" /> : withAcc.length === 0 ? (
          <div className="alert alert-info">No hay clases reportadas para estos filtros.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Grupo</th>
                  <th>Nivel</th>
                  <th className="num">P</th>
                  <th className="num">A</th>
                  <th className="num">J</th>
                  <th className="num">Total</th>
                  <th className="num">Acum. P</th>
                  <th className="num">Acum. total</th>
                </tr>
              </thead>
              <tbody>
                {withAcc.map((r) => (
                  <tr key={r.sessionId} className="clickable" onClick={() => openDetail(r)}>
                    <td>{fmtDate(r.date, { day: '2-digit', month: 'short' })}</td>
                    <td className="font-medium">{r.groupCode}</td>
                    <td>
                      {r.level && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span className="legend-dot" style={{ background: LEVEL_COLOR[r.level] || 'var(--gray-300)' }} />
                          {r.level}
                        </span>
                      )}
                    </td>
                    <td className="num" style={{ color: 'var(--green)', fontWeight: 600 }}>{r.present}</td>
                    <td className="num" style={{ color: 'var(--red)' }}>{r.absent}</td>
                    <td className="num" style={{ color: 'var(--yellow)' }}>{r.justified}</td>
                    <td className="num font-medium">{r.total}</td>
                    <td className="num text-gray">{r.accPresent}</td>
                    <td className="num text-gray">{r.accTotal}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total ({totals.classes || 0} clases)</td>
                  <td className="num" style={{ color: 'var(--green)' }}>{totals.present || 0}</td>
                  <td className="num" style={{ color: 'var(--red)' }}>{totals.absent || 0}</td>
                  <td className="num" style={{ color: 'var(--yellow)' }}>{totals.justified || 0}</td>
                  <td className="num font-medium">{totals.total || 0}</td>
                  <td className="num"></td>
                  <td className="num"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Detalle de la sesión: asistencia por estudiante */}
      {detailRow && (
        <div className="modal-overlay" onClick={() => setDetailRow(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="flex items-center justify-between mb-1">
              <h3>{detailRow.groupCode}</h3>
              <button className="btn btn-ghost" style={{ minHeight: 30 }} onClick={() => setDetailRow(null)}>✕</button>
            </div>
            <div className="text-sm text-gray mb-3">
              {fmtDate(detailRow.date, { weekday: 'long', day: 'numeric', month: 'long' })}
              {detailRow.professor ? ` · ${detailRow.professor}` : ''}
            </div>

            <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
              <span className="badge badge-green">{detailRow.present} Presentes</span>
              <span className="badge badge-red">{detailRow.absent} Ausentes</span>
              <span className="badge badge-yellow">{detailRow.justified} Justificadas</span>
            </div>

            {detailLoading || !detail ? (
              <div className="spinner" />
            ) : detail.error ? (
              <div className="alert alert-error">No se pudo cargar el detalle.</div>
            ) : (
              <div className="card" style={{ maxHeight: 360, overflowY: 'auto', padding: 0 }}>
                {(detail.attendanceRecords || []).length === 0 ? (
                  <div className="text-sm text-gray" style={{ padding: 12 }}>Sin registros de asistencia.</div>
                ) : (
                  detail.attendanceRecords.map((r) => {
                    const b = STATUS_BADGE[r.status] || ['badge-gray', r.status];
                    return (
                      <div key={r.id} className="home-list-row" style={{ padding: '10px 12px' }}>
                        <span className="text-sm font-medium" style={{ flex: 1, minWidth: 0 }}>{r.student?.name || '—'}</span>
                        {r.attendanceType === 'REPOSICION' && <span className="badge badge-blue">Reposición</span>}
                        <span className={`badge ${b[0]}`}>{b[1]}</span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
