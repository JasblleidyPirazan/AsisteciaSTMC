import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate, bogotaTodayStr } from '../../utils/dates';

// Agendamiento de reposiciones — vista de coordinación (/admin/makeup-booking).
// Agenda: turnos de las próximas 2 semanas con quién reservó y el profesor.
// Enviar enlaces: estudiantes con clases por reponer y su enlace personal por
//   WhatsApp (abre WhatsApp con el mensaje listo, sin conexión de API),
//   correo (abre el programa de correo) o copiar.
// Sugerencias: horarios que pidieron los acudientes cuando nada les sirvió.

const dayTitle = (date) => {
  const t = fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const linkFor = (token) => `${window.location.origin}/reponer/${token}`;

function waNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits;
}

function message(s) {
  const n = s.pending;
  return `Hola${s.guardianName ? ` ${s.guardianName}` : ''}, ${s.name} tiene ${n} clase${n !== 1 ? 's' : ''} por reponer `
    + 'en la Escuela de Tenis Santa María. Puedes agendar sus reposiciones aquí, sin usuario ni contraseña:\n'
    + `${linkFor(s.token)}\n\nTurnos: viernes 5:15–6:45 p. m. y sábados 1:30–3:00 p. m. (45 minutos cada uno).`;
}

const tabBtn = (active) => ({
  className: `btn ${active ? 'btn-primary' : 'btn-outline'}`,
  style: { flex: 1, minHeight: 38, fontSize: '0.85rem' },
});
const smallBtn = { minHeight: 34, fontSize: '0.8rem', padding: '0 10px' };

export default function MakeupBookingAdminPage() {
  const [data, setData] = useState(null);
  const [professors, setProfessors] = useState([]);
  const [tab, setTab] = useState('agenda');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [onlyToSchedule, setOnlyToSchedule] = useState(true);
  const [search, setSearch] = useState('');

  const load = () => api.get('/makeup-booking/admin/overview').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.get('/professors', { active: 'true' }).then(setProfessors).catch(() => {});
  }, []);

  async function act(key, fn, okMsg) {
    setBusy(key); setError(''); setNotice('');
    try {
      await fn();
      if (okMsg) setNotice(okMsg);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  const createLink = (s, regenerate = false) => act(`link${s.studentId}`,
    () => api.post(`/makeup-booking/admin/students/${s.studentId}/link`, { regenerate }),
    regenerate ? `Enlace de ${s.name} cambiado: el anterior ya no funciona.` : null);

  async function createAll(list) {
    setBusy('all'); setError(''); setNotice('');
    try {
      for (const s of list) await api.post(`/makeup-booking/admin/students/${s.studentId}/link`, {});
      setNotice(`Se crearon ${list.length} enlaces.`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function copy(s) {
    try {
      await navigator.clipboard.writeText(message(s));
      setNotice(`Mensaje de ${s.name} copiado. Pégalo donde quieras enviarlo.`);
    } catch {
      window.prompt('Copia el enlace:', linkFor(s.token));
    }
  }

  const assignProfessor = (slot, professorId) => act(`prof${slot.sessionId}`,
    () => api.put(`/makeups/${slot.sessionId}`, { professorId }), 'Profesor asignado.');

  const resolveSuggestion = (sg) => act(`sg${sg.id}`,
    () => api.patch(`/makeup-booking/admin/suggestions/${sg.id}`, { resolved: true }));

  if (!data) {
    return (
      <div className="page">
        <div className="page-header"><h1>📅 Agendar reposiciones</h1></div>
        <div className="page-content">{error ? <div className="alert alert-error">{error}</div> : <div className="spinner" />}</div>
      </div>
    );
  }

  const today = bogotaTodayStr();
  const q = search.trim().toLowerCase();
  const students = data.students
    .filter((s) => !onlyToSchedule || s.toSchedule > 0)
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.groups.join(' ').toLowerCase().includes(q));
  const withoutLink = students.filter((s) => !s.token);
  const days = [];
  for (const slot of data.agenda) {
    const last = days[days.length - 1];
    if (last && last.date === slot.date) last.slots.push(slot);
    else days.push({ date: slot.date, slots: [slot] });
  }
  const booked = data.agenda.reduce((acc, s) => acc + s.participants.length, 0);
  const noProfessor = data.agenda.filter((s) => s.sessionId && !s.professor).length;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ flex: 1 }}>
          <h1>📅 Agendar reposiciones</h1>
          <p className="text-xs text-gray">Los acudientes reservan desde su enlace personal, sin usuario ni contraseña</p>
        </div>
      </div>
      <div className="page-content">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button {...tabBtn(tab === 'agenda')} onClick={() => setTab('agenda')}>Agenda ({booked})</button>
          <button {...tabBtn(tab === 'links')} onClick={() => setTab('links')}>
            Enviar enlaces ({data.students.filter((s) => s.toSchedule > 0).length})
          </button>
          <button {...tabBtn(tab === 'suggestions')} onClick={() => setTab('suggestions')}>
            Sugerencias ({data.suggestions.length})
          </button>
        </div>

        {error && <div className="alert alert-error mb-3">{error}</div>}
        {notice && <div className="alert alert-success mb-3">{notice}</div>}

        {tab === 'agenda' && (
          <>
            <p className="text-sm text-gray mb-3">
              Turnos de 45 min de las próximas 2 semanas (máx. {data.rules.capacity} estudiantes, todos los niveles).
              Cada turno reservado es una reposición normal: asígnale profesor para que le aparezca en su panel.
            </p>
            {noProfessor > 0 && (
              <div className="alert alert-error mb-3">⚠️ {noProfessor} turno{noProfessor !== 1 ? 's' : ''} con reservas sin profesor asignado.</div>
            )}
            {days.map((d) => (
              <div key={d.date} className="card mb-2">
                <div className="font-medium mb-2">{dayTitle(d.date)}</div>
                {d.slots.map((slot) => (
                  <div key={slot.key} style={{ padding: '8px 0', borderTop: '1px solid var(--gray-100)' }}>
                    <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="font-medium">{slot.label}</span>
                      <span className={`badge ${slot.participants.length >= slot.capacity ? 'badge-red' : slot.participants.length ? 'badge-blue' : 'badge-gray'}`}>
                        {slot.participants.length} / {slot.capacity}
                      </span>
                    </div>
                    {slot.participants.length === 0 ? (
                      <div className="text-xs text-gray">Sin reservas</div>
                    ) : (
                      <>
                        <div className="text-sm mt-1">
                          {slot.participants.map((p) => p.name).join(' · ')}
                        </div>
                        <div className="flex items-center gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
                          <select className="form-input form-select" style={{ flex: 1, minWidth: 180, minHeight: 36 }}
                            value={slot.professor?.id || ''} disabled={busy === `prof${slot.sessionId}`}
                            onChange={(e) => e.target.value && assignProfessor(slot, e.target.value)}>
                            <option value="">— Asignar profesor —</option>
                            {professors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          {slot.professor && slot.date <= today && (
                            <Link className="btn btn-outline" style={smallBtn} to={`/makeups/${slot.sessionId}/attendance`}>
                              Reportar asistencia
                            </Link>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <p className="text-xs text-gray">
              Para mover a un estudiante de turno o quitarlo, edita la reposición en <Link to="/admin/makeups">Reposiciones</Link>.
            </p>
          </>
        )}

        {tab === 'links' && (
          <>
            <p className="text-sm text-gray mb-3">
              Estudiantes con clases por reponer. Crea su enlace personal y envíalo: <strong>WhatsApp</strong> abre
              la conversación con el mensaje listo (solo hay que darle enviar) y <strong>Correo</strong> abre tu
              programa de correo. No necesita ninguna conexión adicional.
            </p>
            <input className="form-input mb-2" placeholder="Buscar estudiante o grupo…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
            <label className="flex items-center gap-2 text-sm mb-3">
              <input type="checkbox" checked={onlyToSchedule} onChange={(e) => setOnlyToSchedule(e.target.checked)} />
              Solo los que aún tienen clases sin agendar
            </label>
            {withoutLink.length > 0 && (
              <button className="btn btn-outline btn-full mb-3" disabled={!!busy} onClick={() => createAll(withoutLink)}>
                {busy === 'all' ? 'Creando…' : `🔗 Crear enlaces para todos (${withoutLink.length})`}
              </button>
            )}
            {students.length === 0 && <div className="alert alert-info">No hay estudiantes en esta lista.</div>}
            {students.map((s) => {
              const wa = waNumber(s.phone);
              return (
                <div key={s.studentId} className="card mb-2">
                  <div className="flex items-center justify-between" style={{ gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-gray">
                        {s.groups.join(', ')} · debe {s.pending}
                        {s.reserved > 0 && ` · agendadas ${s.reserved}`}
                        {s.toSchedule > 0 ? ` · faltan ${s.toSchedule}` : ' · todo agendado ✓'}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
                    {!s.token ? (
                      <button className="btn btn-primary" style={smallBtn} disabled={!!busy} onClick={() => createLink(s)}>
                        {busy === `link${s.studentId}` ? 'Creando…' : '🔗 Crear enlace'}
                      </button>
                    ) : (
                      <>
                        {wa ? (
                          <a className="btn btn-primary" style={smallBtn} target="_blank" rel="noreferrer"
                            href={`https://wa.me/${wa}?text=${encodeURIComponent(message(s))}`}>📲 WhatsApp</a>
                        ) : (
                          <span className="text-xs text-gray" style={{ alignSelf: 'center' }}>Sin celular</span>
                        )}
                        {s.email ? (
                          <a className="btn btn-outline" style={smallBtn}
                            href={`mailto:${s.email}?subject=${encodeURIComponent(`Reposiciones de ${s.name} — Escuela de Tenis`)}&body=${encodeURIComponent(message(s))}`}>
                            ✉️ Correo
                          </a>
                        ) : (
                          <span className="text-xs text-gray" style={{ alignSelf: 'center' }}>Sin correo</span>
                        )}
                        <button className="btn btn-outline" style={smallBtn} onClick={() => copy(s)}>📋 Copiar mensaje</button>
                        <button className="btn btn-ghost" style={smallBtn} disabled={!!busy}
                          title="Invalida el enlace anterior (por ejemplo, si se envió a quien no era)"
                          onClick={() => window.confirm(`¿Cambiar el enlace de ${s.name}? El anterior dejará de funcionar.`) && createLink(s, true)}>
                          🔄 Cambiar enlace
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === 'suggestions' && (
          <>
            <p className="text-sm text-gray mb-3">Horarios que propusieron los acudientes cuando ningún turno les sirvió.</p>
            {data.suggestions.length === 0 && <div className="alert alert-info">No hay sugerencias pendientes.</div>}
            {data.suggestions.map((sg) => (
              <div key={sg.id} className="card mb-2">
                <div className="flex items-center justify-between" style={{ gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="font-medium">{sg.student.name}</div>
                    <div className="text-xs text-gray">{fmtDate(sg.createdAt)}{sg.student.phone && ` · ${sg.student.phone}`}{sg.student.email && ` · ${sg.student.email}`}</div>
                  </div>
                  <button className="btn btn-outline" style={smallBtn} disabled={!!busy} onClick={() => resolveSuggestion(sg)}>
                    ✓ Atendida
                  </button>
                </div>
                <div className="mt-2" style={{ whiteSpace: 'pre-wrap' }}>“{sg.text}”</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
