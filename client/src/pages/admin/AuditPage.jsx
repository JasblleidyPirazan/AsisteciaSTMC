import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

// Auditoría: feed unificado de acciones del sistema (ediciones de reportes,
// cambios de grupo, movimientos de liquidación). Solo lectura, filtrable.

const TYPE_META = {
  SESSION_EDIT: { label: 'Reportes', icon: '📝', color: '#7A5AF8' },
  GROUP_CHANGE: { label: 'Grupos', icon: '🔀', color: '#EA8A2E' },
  PAYROLL: { label: 'Liquidación', icon: '💰', color: '#1FA971' },
};

function fmtWhen(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleString('es-CO', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDay(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function dayKey(d) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function AuditPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  function load() {
    setLoading(true);
    setError('');
    const params = {};
    if (type) params.type = type;
    if (from) params.from = from;
    if (to) params.to = to;
    api.get('/audit', params)
      .then((d) => { setEvents(d.events || []); setTruncated(!!d.truncated); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [type, from, to]);

  // Agrupa los eventos por día para separarlos visualmente.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const k = dayKey(ev.at);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    }
    return [...map.entries()];
  }, [events]);

  return (
    <div className="page page-wide">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <div style={{ flex: 1 }}>
          <h1>Auditoría</h1>
          <p className="text-xs text-gray">Registro de acciones del sistema</p>
        </div>
      </div>

      <div className="page-content">
        {/* Filtros por tipo */}
        <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
          <button className={`btn ${type === '' ? 'btn-primary' : 'btn-outline'}`}
            style={{ minHeight: 34, padding: '0 12px', fontSize: '0.8rem' }}
            onClick={() => setType('')}>Todo</button>
          {Object.entries(TYPE_META).map(([key, m]) => (
            <button key={key} className={`btn ${type === key ? 'btn-primary' : 'btn-outline'}`}
              style={{ minHeight: 34, padding: '0 12px', fontSize: '0.8rem' }}
              onClick={() => setType(key)}>{m.icon} {m.label}</button>
          ))}
        </div>

        {/* Filtros por fecha */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }} className="mb-3">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Desde</label>
            <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Hasta</label>
            <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {(from || to) && (
            <button className="btn btn-ghost" style={{ minHeight: 40 }}
              onClick={() => { setFrom(''); setTo(''); }}>Limpiar</button>
          )}
        </div>

        {error && <div className="alert alert-error mb-3">{error}</div>}

        {loading ? (
          <div className="spinner" />
        ) : events.length === 0 ? (
          <div className="alert alert-info">No hay acciones registradas para estos filtros.</div>
        ) : (
          <>
            {truncated && (
              <div className="alert alert-info mb-3 text-sm">
                Mostrando las acciones más recientes. Acota con fechas para ver un período específico.
              </div>
            )}
            {grouped.map(([day, evs]) => (
              <div key={day} className="mb-3">
                <div className="time-slot-header">{day}</div>
                {evs.map((ev) => {
                  const m = TYPE_META[ev.type] || { icon: '•', color: 'var(--gray-400)' };
                  return (
                    <div key={ev.id} className="card mb-2" style={{ borderLeft: `4px solid ${m.color}` }}>
                      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.05rem' }}>{m.icon}</span>
                        <span className="font-medium text-sm">{ev.title}</span>
                        {ev.subject && <span className="chip">{ev.subject}</span>}
                        <span className="text-xs text-gray" style={{ marginLeft: 'auto' }}>{fmtWhen(ev.at)}</span>
                      </div>
                      <div className="text-xs text-gray mt-1" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {ev.actor && <span>👤 {ev.actor}</span>}
                        {ev.detail && <span>· {ev.detail}</span>}
                        {ev.sessionDate && <span>· Clase del {fmtDay(ev.sessionDate)}</span>}
                        {ev.reason && <span>· Motivo: {ev.reason}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
