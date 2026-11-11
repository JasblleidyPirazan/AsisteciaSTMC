import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { fmtDate } from '../utils/dates';

const n = (v) => Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 });
const short = (d) => fmtDate(d, { day: 'numeric', month: 'short' });

// Avance de las reposiciones: cuántas se causaron, cuántas ya se dictaron,
// cuántas están programadas y cuántas faltan por agendar, más el reporte por
// semana. Sale de GET /api/ledger/makeups-progress (mismo ledger del sistema).
export default function MakeupProgress() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showWeeks, setShowWeeks] = useState(false);

  useEffect(() => {
    api.get('/ledger/makeups-progress').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error mb-3">{error}</div>;
  if (!data) return <div className="card mb-3 text-sm text-gray">Calculando avance de reposiciones…</div>;
  if (!data.totals) return null;
  const t = data.totals;
  const pct = (v) => (t.causadas > 0 ? (v / t.causadas) * 100 : 0);
  const done = t.causadas > 0 ? Math.round(((t.aplicadas + t.sinReponer) / t.causadas) * 100) : 0;

  const box = (label, value, color, help) => (
    <div title={help} style={{ flex: 1, minWidth: 110, background: 'var(--gray-50, #f9fafb)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{n(value)}</div>
      <div className="text-xs text-gray">{label}</div>
    </div>
  );

  return (
    <div className="card mb-3">
      <div className="flex items-center justify-between mb-2" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="text-sm font-medium">🔁 Avance de las reposiciones</div>
        <div className="text-xs text-gray">{n(t.causadas)} causadas en {t.students} {t.students === 1 ? 'estudiante' : 'estudiantes'} · {done} % resuelto</div>
      </div>

      <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
        {box('Pendientes', t.pendientes, 'var(--yellow)', 'Clases por reponer que todavía no se han dictado (programadas + por agendar)')}
        {box('Programadas', t.programadas, 'var(--blue)', 'Ya tienen turno de reposición reservado, aún sin dictar')}
        {box('Ya dictadas', t.dictadas, 'var(--green)', 'Reposiciones ya reportadas (asistió o faltó: una falta a la reposición la pierde)')}
      </div>

      {/* Barra: de lo causado, qué ya se resolvió y qué falta */}
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: 'var(--gray-200, #e5e7eb)' }}>
        <span title="Dictadas" style={{ width: `${pct(t.aplicadas)}%`, background: 'var(--green)' }} />
        <span title="Programadas" style={{ width: `${pct(t.programadas)}%`, background: 'var(--blue)' }} />
        <span title="Por agendar" style={{ width: `${pct(t.porAgendar)}%`, background: 'var(--yellow)' }} />
        <span title="Ya no se reponen" style={{ width: `${pct(t.sinReponer)}%`, background: '#9ca3af' }} />
      </div>
      <div className="text-xs text-gray mt-1" style={{ lineHeight: 1.6 }}>
        <span style={{ color: 'var(--green)' }}>●</span> Dictadas {n(t.aplicadas)}
        {' · '}<span style={{ color: 'var(--blue)' }}>●</span> Programadas {n(t.programadas)}
        {' · '}<span style={{ color: 'var(--yellow)' }}>●</span> Por agendar {n(t.porAgendar)}
        {t.sinReponer > 0 && <>{' · '}<span style={{ color: '#9ca3af' }}>●</span> Ya no se reponen {n(t.sinReponer)}</>}
        <br />
        Causadas: {n(t.lluvia)} por lluvia · {n(t.otras)} canceladas por la Escuela · {n(t.justificadas)} justificadas.
        {t.perdidas > 0 && ` De las dictadas, ${n(t.perdidas)} con falta (la reposición se pierde).`}
        {t.dictadas > t.aplicadas && ` ${n(t.dictadas - t.aplicadas)} dictadas de más se aplicaron a festivos.`}
        {t.sinReponer > 0 && ' "Ya no se reponen": estudiantes que completaron su paquete con otras clases.'}
      </div>

      <button className="btn btn-outline mt-2" style={{ minHeight: 32, fontSize: '0.8rem' }} onClick={() => setShowWeeks((v) => !v)}>
        {showWeeks ? '▲ Ocultar reporte semanal' : '📅 Ver reporte por semana'}
      </button>

      {showWeeks && (
        <div className="mt-2" style={{ overflowX: 'auto' }}>
          {data.weeks.length === 0 ? <div className="text-sm text-gray">Aún no hay reposiciones causadas.</div> : (
            <table className="table" style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'right', color: 'var(--gray-500, #6b7280)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Semana</th>
                  <th style={{ padding: '4px 6px' }} title="Clases de origen: lluvia + Escuela + justificadas">Causadas</th>
                  <th style={{ padding: '4px 6px' }}>Lluvia</th>
                  <th style={{ padding: '4px 6px' }}>Escuela</th>
                  <th style={{ padding: '4px 6px' }}>Justif.</th>
                  <th style={{ padding: '4px 6px' }} title="Reposiciones reportadas esa semana">Repuestas</th>
                  <th style={{ padding: '4px 6px' }} title="Faltó a la reposición: se pierde">Perdidas</th>
                  <th style={{ padding: '4px 6px' }} title="Turnos reservados esa semana, aún sin reportar">Programadas</th>
                  <th style={{ padding: '4px 6px' }} title="Reposiciones que se debían al cierre de la semana (estudiante por estudiante)">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.weeks.map((w) => (
                  <tr key={w.weekStart} style={{ textAlign: 'right', borderTop: '1px solid var(--gray-200, #e5e7eb)', background: w.current ? 'var(--green-light, #ecfdf5)' : undefined, color: w.future ? 'var(--gray-500, #6b7280)' : undefined }}>
                    <td style={{ textAlign: 'left', padding: '4px 6px', whiteSpace: 'nowrap' }}>
                      {short(w.weekStart)} – {short(w.weekEnd)}{w.current ? ' · esta semana' : ''}
                    </td>
                    <td style={{ padding: '4px 6px', fontWeight: 600 }}>{w.causadas ? n(w.causadas) : '—'}</td>
                    <td style={{ padding: '4px 6px' }}>{w.lluvia || ''}</td>
                    <td style={{ padding: '4px 6px' }}>{w.otras || ''}</td>
                    <td style={{ padding: '4px 6px' }}>{w.justificadas || ''}</td>
                    <td style={{ padding: '4px 6px', fontWeight: 600, color: 'var(--green)' }}>{w.asistidas ? n(w.asistidas) : '—'}</td>
                    <td style={{ padding: '4px 6px', color: 'var(--red)' }}>{w.perdidas ? n(w.perdidas) : ''}</td>
                    <td style={{ padding: '4px 6px', color: 'var(--blue)' }}>{w.programadas ? n(w.programadas) : ''}</td>
                    <td style={{ padding: '4px 6px' }}>{w.future ? '' : n(w.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ textAlign: 'right', borderTop: '2px solid var(--gray-300, #d1d5db)', fontWeight: 700 }}>
                  <td style={{ textAlign: 'left', padding: '4px 6px' }}>Total</td>
                  <td style={{ padding: '4px 6px' }}>{n(t.causadas)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(t.lluvia)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(t.otras)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(t.justificadas)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(t.asistidas)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(t.perdidas)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(data.weeks.reduce((a, w) => a + w.programadas, 0))}</td>
                  <td style={{ padding: '4px 6px' }} />
                </tr>
              </tfoot>
            </table>
          )}
          <p className="text-xs text-gray mt-1">
            Cada clase causada se ubica en la semana en que ocurrió (la clase cancelada o la falta justificada); cada reposición, en la
            semana en que se dictó o está programada. El saldo es cuántas reposiciones se debían al cierre de cada semana: se calcula estudiante por estudiante, así que una reposición que alguien tomó de más (para recuperar festivos) no salda la deuda de otro. La última semana coincide con las pendientes más las que ya no se reponen.
          </p>
        </div>
      )}
    </div>
  );
}
