import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { fmtDate } from '../utils/dates';

// Agendamiento público de reposiciones (/reponer/:token). Sin login: el código
// del enlace identifica al estudiante. El acudiente ve cuántas clases tiene por
// reponer, reserva turnos de 45 min y, si ninguno le sirve, sugiere otro horario.
// Datos de /makeup-booking/:token (server/src/routes/makeupBooking.js).
// Con purpose="REPROGRAMACION" (/reprogramar/:token) es la misma página para las
// clases no vistas por festivos o recesos: mismos turnos, saldo distinto.

const dayTitle = (date) => {
  const t = fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const fmtStart = (hm) => {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
};

export default function MakeupBookingPage({ purpose = 'REPOSICION' }) {
  const { token } = useParams();
  const reprog = purpose === 'REPROGRAMACION';
  const stateUrl = `/makeup-booking/${token}${reprog ? '?purpose=REPROGRAMACION' : ''}`;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [suggestion, setSuggestion] = useState('');

  useEffect(() => {
    api.get(stateUrl).then(setData).catch((e) => setError(e.message));
  }, [stateUrl]);

  async function run(key, fn, okMsg) {
    setBusy(key); setError(''); setNotice('');
    try {
      setData(await fn());
      if (okMsg) setNotice(okMsg);
    } catch (e) {
      setError(e.message);
      // Refresca: el cupo pudo cambiar mientras tanto
      api.get(stateUrl).then(setData).catch(() => {});
    } finally {
      setBusy('');
    }
  }

  const book = (slot) => run(`${slot.date}|${slot.key}`,
    () => api.post(`/makeup-booking/${token}/book`, { date: slot.date, slotKey: slot.key, purpose }),
    `✅ Reservado: ${dayTitle(slot.date)}, ${slot.label}.`);
  const cancel = (b) => {
    if (!window.confirm('¿Cancelar esta reserva?')) return;
    run(`c${b.sessionId}`, () => api.delete(`/makeup-booking/${token}/book/${b.sessionId}`), 'Reserva cancelada.');
  };
  const suggest = (e) => {
    e.preventDefault();
    run('suggest', () => api.post(`/makeup-booking/${token}/suggestions`, { text: suggestion.trim(), purpose }),
      '📨 Recibimos tu sugerencia. La Escuela te contactará.')
      .then(() => setSuggestion(''));
  };

  const header = (
    <div className="page-header">
      <div style={{ flex: 1 }}>
        <h1>{reprog ? '📆 Agenda tus clases reprogramadas' : '🎾 Agenda tus reposiciones'}</h1>
        <p className="text-xs text-gray">Escuela de Tenis Santa María</p>
      </div>
    </div>
  );

  if (!data) {
    return (
      <div className="page">
        {header}
        <div className="page-content">
          {error ? <div className="alert alert-error">{error}</div> : <div className="spinner" />}
        </div>
      </div>
    );
  }

  const { student, debt, available, slots, myBookings, suggestions, rules } = data;
  const days = [];
  for (const s of slots) {
    const last = days[days.length - 1];
    if (last && last.date === s.date) last.slots.push(s);
    else days.push({ date: s.date, slots: [s] });
  }
  const word = reprog ? 'reprogramar' : 'reponer';
  const breakdown = reprog ? '' : [
    debt.rain > 0 && `${debt.rain} por lluvia`,
    debt.other > 0 && `${debt.other} cancelada${debt.other !== 1 ? 's' : ''} por la Escuela`,
    debt.justified > 0 && `${debt.justified} justificada${debt.justified !== 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');
  const openSuggestions = suggestions.filter((s) => !s.resolved);

  return (
    <div className="page">
      {header}
      <div className="page-content">
        <div className="card mb-3">
          <div className="font-medium" style={{ fontSize: '1.1rem' }}>{student.name}</div>
          {student.groups.length > 0 && <div className="text-xs text-gray">Grupo {student.groups.join(', ')}</div>}
          <div className="mt-2">
            {debt.pending > 0 ? (
              <>
                Tiene <strong>{debt.pending} clase{debt.pending !== 1 ? 's' : ''} por {word}</strong>
                {breakdown && <span className="text-sm text-gray"> ({breakdown})</span>}
                {reprog && <span className="text-sm text-gray"> (no se dictaron por festivos o días de receso)</span>}.
                {reprog && debt.items?.length > 0 && (
                  <div className="text-xs text-gray mt-1">
                    {debt.items.map((i) => `${fmtDate(i.date)}${i.reason ? ` (${i.reason})` : ''}`).join(' · ')}
                  </div>
                )}
                <div className="text-sm mt-1">
                  {available > 0
                    ? <>Puedes reservar <strong>{available}</strong> turno{available !== 1 ? 's' : ''} más.</>
                    : <>Ya agendaste todas sus {reprog ? 'clases reprogramadas' : 'reposiciones'}. 🙌</>}
                </div>
              </>
            ) : (
              <span>No tiene clases pendientes por {word}. 🙌</span>
            )}
          </div>
        </div>

        {error && <div className="alert alert-error mb-3">{error}</div>}
        {notice && <div className="alert alert-success mb-3">{notice}</div>}

        {myBookings.length > 0 && (
          <div className="card mb-3">
            <h3 style={{ marginBottom: 8 }}>{reprog ? 'Tus clases reprogramadas' : 'Tus reposiciones agendadas'}</h3>
            {myBookings.map((b) => (
              <div key={b.sessionId} className="flex items-center justify-between mb-2" style={{ gap: 8 }}>
                <div>
                  <div className="font-medium">{dayTitle(b.date)}</div>
                  <div className="text-xs text-gray">
                    {b.start ? `Turno de ${fmtStart(b.start)}` : (b.title || 'Reposición')}
                    {!b.bookedByParent && ' · programada por la Escuela'}
                  </div>
                </div>
                {b.cancellable ? (
                  <button className="btn btn-outline" style={{ minHeight: 36, fontSize: '0.85rem' }}
                    disabled={!!busy} onClick={() => cancel(b)}>
                    {busy === `c${b.sessionId}` ? '…' : 'Cancelar'}
                  </button>
                ) : b.bookedByParent ? (
                  <span className="text-xs text-gray" title={`Se cancela hasta ${rules.cancelCutoffHours} h antes`}>Confirmada</span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <h3 style={{ marginBottom: 4 }}>Turnos disponibles</h3>
        <p className="text-xs text-gray mb-3">
          Máximo {rules.capacity} estudiantes por turno. Cada turno cuenta como una clase.
          Reservas hasta {rules.bookCutoffHours} horas antes; cancelaciones hasta {rules.cancelCutoffHours} horas antes.
        </p>
        {days.length === 0 && <div className="alert alert-info mb-3">No hay turnos en las próximas semanas.</div>}
        {days.map((d) => (
          <div key={d.date} className="card mb-2">
            <div className="font-medium mb-2">{dayTitle(d.date)}</div>
            {d.slots.map((s) => {
              const left = s.capacity - s.taken;
              let status;
              if (s.mine) status = <span className="badge badge-green">✓ Reservado</span>;
              else if (s.busyOther) status = <span className="badge badge-gray">Ya tienes {reprog ? 'una reposición' : 'una reprogramación'} aquí</span>;
              else if (s.full) status = <span className="badge badge-gray">Lleno</span>;
              else if (s.closed) status = <span className="badge badge-gray">Cerrado</span>;
              else status = <span className="text-xs text-gray">{left} cupo{left !== 1 ? 's' : ''}</span>;
              return (
                <div key={s.key} className="flex items-center justify-between" style={{ gap: 8, padding: '6px 0' }}>
                  <div>
                    <div>{s.label}</div>
                    <div>{status}</div>
                  </div>
                  {s.bookable && (
                    <button className="btn btn-primary" style={{ minHeight: 40, fontSize: '0.9rem' }}
                      disabled={!!busy} onClick={() => book(s)}>
                      {busy === `${s.date}|${s.key}` ? 'Reservando…' : 'Reservar'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div className="card mt-3">
          <h3 style={{ marginBottom: 4 }}>¿Ninguno de estos horarios te sirve?</h3>
          <p className="text-xs text-gray mb-2">Cuéntanos qué días y horas podrías. La Escuela revisa las sugerencias para abrir nuevos turnos.</p>
          <form onSubmit={suggest}>
            <textarea className="form-input" rows={3} style={{ width: '100%' }} maxLength={500} value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder="Ej: martes o jueves después de las 4 p. m." />
            <button type="submit" className="btn btn-outline btn-full mt-2"
              disabled={!!busy || suggestion.trim().length < 3}>
              {busy === 'suggest' ? 'Enviando…' : 'Enviar sugerencia'}
            </button>
          </form>
          {openSuggestions.length > 0 && (
            <div className="text-xs text-gray mt-2">
              Sugerencias enviadas: {openSuggestions.map((s) => `“${s.text}”`).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
