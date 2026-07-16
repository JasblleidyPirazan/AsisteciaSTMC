import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';

// Vista de calendario semanal de la liquidación: malla semana × horario × día.
// Cada clase es una tarjeta con su costo y estado; al tocarla se abre el detalle.

const DAYS = [
  { key: 1, label: 'lun' }, { key: 2, label: 'mar' }, { key: 3, label: 'mié' },
  { key: 4, label: 'jue' }, { key: 5, label: 'vie' }, { key: 6, label: 'sáb' }, { key: 0, label: 'dom' },
];

function fmtK(n) {
  if (!n) return '$0';
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}
function ymd(dateLike) {
  return String(dateLike).slice(0, 10);
}
// Lunes (YYYY-MM-DD) de la semana que contiene la fecha (en UTC, sin drift).
function mondayOf(ymdStr) {
  const d = new Date(`${ymdStr}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Dom
  const offset = (dow + 6) % 7; // días desde el lunes
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}
function addDays(ymdStr, n) {
  const d = new Date(`${ymdStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayNum(ymdStr) {
  return new Date(`${ymdStr}T00:00:00.000Z`).getUTCDate();
}

// Color y notas de la tarjeta según el estado de la clase.
function cardStyle(s) {
  if (s.status === 'CANCELADA') {
    if (s.cancellationCategory === 'LLUVIA') return { bg: 'rgba(232,82,106,0.12)', border: 'var(--red)', ico: '🌧️' };
    return { bg: 'var(--gray-100, #eceef3)', border: 'var(--gray-400)', ico: '⛔' };
  }
  return { bg: 'rgba(31,169,113,0.12)', border: 'var(--green)', ico: '✓' };
}

export default function PayrollCalendar({ range, semester }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    if (!range?.from) return;
    setLoading(true);
    api.get('/payroll/calendar', { from: range.from, to: range.to })
      .then((d) => setSessions(d || []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [range?.from, range?.to]);

  // Semanas (lunes) cubiertas por las clases, ordenadas.
  const weeks = useMemo(() => {
    const set = new Set(sessions.map((s) => mondayOf(ymd(s.date))));
    return [...set].sort();
  }, [sessions]);

  // Franjas horarias distintas, ordenadas; las sesiones sin horario (reposiciones)
  // van a una fila final.
  const slots = useMemo(() => {
    const set = new Set(sessions.filter((s) => s.startTime).map((s) => `${s.startTime}|${s.endTime || ''}`));
    const arr = [...set].sort();
    const hasNoTime = sessions.some((s) => !s.startTime);
    return { arr, hasNoTime };
  }, [sessions]);

  if (loading) return <div className="spinner" />;
  if (sessions.length === 0) return <div className="alert alert-info">No hay clases en esta quincena.</div>;

  return (
    <div>
      {weeks.map((monday, wi) => (
        <div key={monday} className="table-wrap mb-4" style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: 'var(--brand-indigo, #3F52A8)', color: '#fff', padding: '10px 14px', fontWeight: 700 }}>
            Semana {wi + 1} ({monday} – {addDays(monday, 6)})
          </div>
          <table className="data-table" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 92 }}>Horario</th>
                {DAYS.map((d, i) => (
                  <th key={d.key} style={{ textAlign: 'center' }}>
                    {d.label}<div className="text-xs text-gray" style={{ fontWeight: 400 }}>{dayNum(addDays(monday, i))}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...slots.arr, ...(slots.hasNoTime ? ['__none__'] : [])].map((slot) => {
                const [st, et] = slot === '__none__' ? [null, null] : slot.split('|');
                return (
                  <tr key={slot}>
                    <td className="text-sm" style={{ verticalAlign: 'top', fontWeight: 600 }}>
                      {slot === '__none__' ? 'Reposiciones' : `${st} - ${et}`}
                    </td>
                    {DAYS.map((d, i) => {
                      const dayStr = addDays(monday, i);
                      const cell = sessions.filter((s) =>
                        ymd(s.date) === dayStr &&
                        (slot === '__none__' ? !s.startTime : s.startTime === st));
                      return (
                        <td key={d.key} style={{ verticalAlign: 'top', padding: 4 }}>
                          {cell.map((s) => {
                            const cs = cardStyle(s);
                            return (
                              <button key={s.id} className="cal-card"
                                style={{ background: cs.bg, borderLeft: `3px solid ${cs.border}` }}
                                onClick={() => setDetailId(s.id)} title="Ver detalle de la clase">
                                <div className="flex items-center justify-between" style={{ gap: 4 }}>
                                  <span className="font-medium text-xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {s.code} · {s.professor}
                                  </span>
                                  <span style={{ fontSize: '0.7rem' }}>{cs.ico}</span>
                                </div>
                                {s.status !== 'CANCELADA' ? (
                                  <div className="flex items-center justify-between text-xs text-gray">
                                    <span>👥 {s.present}</span>
                                    <strong style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmtK(s.cost)}</strong>
                                  </div>
                                ) : (
                                  <div className="text-xs" style={{ color: cs.border }}>
                                    {s.cancellationCategory === 'LLUVIA' ? 'Lluvia' : s.cancellationCategory === 'SIN_ESTUDIANTES' ? 'Sin estudiantes' : 'Cancelada'}
                                  </div>
                                )}
                                {s.status !== 'CANCELADA' && s.dictatedByOwner === false && (
                                  <div className="text-xs" style={{ color: 'var(--orange, #EA8A2E)' }}>Cambio de profesor</div>
                                )}
                                {s.makeupCount > 0 && (
                                  <div className="text-xs" style={{ color: 'var(--brand-indigo, var(--blue))' }}>R: {s.makeupCount} reposición</div>
                                )}
                              </button>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {detailId && <ClassDetailModal sessionId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// Modal con el detalle de la clase (reusa GET /reports/class/:sessionId).
const ATT = { PRESENTE: { l: 'P', c: 'var(--green)' }, AUSENTE: { l: 'A', c: 'var(--red)' }, JUSTIFICADA: { l: 'J', c: 'var(--blue)' } };
function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}
function ClassDetailModal({ sessionId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get(`/reports/class/${sessionId}`).then(setData).catch(() => setData({ error: true })).finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="flex items-center justify-between mb-2">
          <h3>Detalle de la clase</h3>
          <button className="btn btn-ghost" style={{ minHeight: 30 }} onClick={onClose}>✕</button>
        </div>
        {loading ? <div className="spinner" /> : data?.error ? (
          <div className="alert alert-error">No se pudo cargar la clase.</div>
        ) : (
          <>
            <div className="font-medium">{data.group?.code || data.title}</div>
            <div className="text-sm text-gray mb-2">
              {fmtDate(data.date)}{data.substituteProfessor ? ` · Sustituto: ${data.substituteProfessor.name}` : ''}
              {data.assistant ? ` · Asistente: ${data.assistant.name}` : ''}
            </div>
            <div className="stats-row mb-2">
              <div className="stat-box"><div className="num">{data.present}</div><div className="lbl">Presentes</div></div>
              <div className="stat-box"><div className="num" style={{ color: 'var(--red)' }}>{data.absent}</div><div className="lbl">Ausentes</div></div>
              <div className="stat-box"><div className="num" style={{ color: 'var(--blue)' }}>{data.justified}</div><div className="lbl">Justificados</div></div>
              {data.professorCost != null && data.professorCost > 0 && (
                <div className="stat-box"><div className="num" style={{ fontSize: '0.9rem' }}>{fmtCOP(data.professorCost)}</div><div className="lbl">Pago profesor</div></div>
              )}
            </div>
            {/* Desglose del costo (coincide con el valor de la tarjeta = pago profesor) */}
            {data.totalCost != null && (data.assistantCost > 0) && (
              <div className="text-xs text-gray mb-3">
                Asistente: {fmtCOP(data.assistantCost)} · Costo total de la clase: <strong>{fmtCOP(data.totalCost)}</strong>
              </div>
            )}
            {data.dictatedByOwner === false && (
              <div className="alert alert-info mb-2"><span className="text-xs">⚠️ No dictada por el titular{data.notDictatedNote ? ` — ${data.notDictatedNote}` : ''}</span></div>
            )}
            {(data.attendanceRecords || []).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm" style={{ padding: '2px 0' }}>
                <span>{r.student?.name}{r.attendanceType === 'REPOSICION' ? ' · reposición' : ''}</span>
                <span style={{ fontWeight: 700, color: ATT[r.status]?.c }}>{ATT[r.status]?.l || '—'}</span>
              </div>
            ))}
            {(!data.attendanceRecords || data.attendanceRecords.length === 0) && (
              <div className="text-sm text-gray">Sin registros de asistencia.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
