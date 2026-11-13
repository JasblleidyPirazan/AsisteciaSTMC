import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate, bogotaTodayStr } from '../../utils/dates';
import WeeklyEmailPanel from '../../components/WeeklyEmailPanel';

// Agendamiento de reposiciones y reprogramaciones — vista de coordinación (/admin/makeup-booking).
// Agenda: turnos de las próximas 2 semanas con quién reservó y el profesor.
//   Reposiciones y reprogramaciones comparten los mismos turnos y cupo.
// Enlaces de reposición (/reponer/:token): lluvia, canceladas por la Escuela, justificadas.
// Enlaces de reprogramación (/reprogramar/:token): clases no vistas por festivos o recesos.
//   Ambos se envían por WhatsApp (mensaje listo, sin conexión de API), correo o copiar.
//   Por grupo (/reprogramar/g/:token): un solo enlace para todos los estudiantes del
//   grupo; el acudiente elige a su hijo. Ideal para mandarlo al chat del grupo.
// Sugerencias: horarios que pidieron los acudientes cuando nada les sirvió.
// Profesor L (data.canManage = false): solo la Agenda, y en ella solo agregar y
// mover estudiantes (sin quitar, sin asignar profesor, sin enlaces ni sugerencias).

const dayTitle = (date) => {
  const t = fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
// kind: 'repos' (reposiciones) | 'reprog' (reprogramaciones por festivos y recesos)
const linkFor = (token, kind = 'repos') => `${window.location.origin}/${kind === 'reprog' ? 'reprogramar' : 'reponer'}/${token}`;

function waNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits;
}

function message(s, rules, kind = 'repos') {
  const n = s.pending;
  const turnos = (rules?.slots || []).map((t) => `${t.day} ${t.label}${t.ages ? ` (${t.ages})` : ""}`).join(' · ');
  const hola = `Hola${s.guardianName ? ` ${s.guardianName}` : ''}, `;
  const body = kind === 'reprog'
    ? `${s.name} tiene ${n} clase${n !== 1 ? 's' : ''} por reprogramar (no se dictaron por festivos o días de receso) `
      + 'en la Escuela de Tenis Santa María. Puedes agendarlas aquí, sin usuario ni contraseña:\n'
    : `${s.name} tiene ${n} clase${n !== 1 ? 's' : ''} por reponer `
      + 'en la Escuela de Tenis Santa María. Puedes agendar sus reposiciones aquí, sin usuario ni contraseña:\n';
  return `${hola}${body}${linkFor(s.token, kind)}${turnos ? `\n\nTurnos: ${turnos}.` : ''}`;
}

const groupLinkFor = (token) => `${window.location.origin}/reprogramar/g/${token}`;

function groupMessage(g, rules) {
  const turnos = (rules?.slots || []).map((t) => `${t.day} ${t.label}${t.ages ? ` (${t.ages})` : ""}`).join(' · ');
  return `Hola, familias del grupo ${g.code}: algunas clases no se dictaron por festivos o días de receso `
    + 'y las vamos a reprogramar. Con este enlace pueden agendarlas, sin usuario ni contraseña: '
    + 'abran el enlace, toquen el nombre de su hijo o hija y elijan un turno.\n'
    + `${groupLinkFor(g.token)}${turnos ? `\n\nTurnos: ${turnos}.` : ''}`;
}

const KIND_TEXT = {
  repos: {
    title: '🔁 Enlaces de reposición',
    intro: 'Estudiantes con clases por reponer (lluvia, canceladas por la Escuela y justificadas).',
    owe: 'debe', subject: 'Reposiciones',
  },
  reprog: {
    title: '📆 Enlaces de reprogramación',
    intro: 'Estudiantes con clases no vistas por festivos o días de receso. El enlace es distinto al de reposiciones (/reprogramar/…) y solo deja agendar estas clases.',
    owe: 'por reprogramar', subject: 'Reprogramación de clases',
  },
};

// Formulario para agregar un estudiante a un turno de la agenda. Sugiere primero
// a los que tienen clases por reponer o reprogramar (con cuántas les faltan) y
// permite buscar a cualquier estudiante activo. El propósito decide de qué saldo
// descuenta la reserva: reposición o reprogramación.
function AddStudentForm({ data, slot, busy, onAdd, onCancel }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [purpose, setPurpose] = useState('REPOSICION');
  const inSlot = new Set(slot.participants.map((p) => p.id));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => {
      api.get('/search', { q: term }).then((r) => setFound(r.students || [])).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const owing = {};
  for (const s of data.students) owing[s.studentId] = { ...(owing[s.studentId] || {}), name: s.name, groups: s.groups, repos: s.toSchedule };
  for (const s of data.reprogStudents || []) owing[s.studentId] = { ...(owing[s.studentId] || {}), name: s.name, groups: s.groups, reprog: s.toSchedule };
  const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const term = norm(q.trim());
  const suggestions = Object.entries(owing)
    .filter(([id, o]) => !inSlot.has(id) && (purpose === 'REPROGRAMACION' ? o.reprog > 0 : o.repos > 0))
    .filter(([, o]) => !term || norm(o.name).includes(term) || norm((o.groups || []).join(' ')).includes(term))
    .slice(0, 8);
  const others = found.filter((st) => !inSlot.has(st.id) && !suggestions.some(([id]) => id === st.id)).slice(0, 6);

  const row = (id, name, detail) => (
    <button key={id} type="button" className="btn btn-outline" disabled={!!busy}
      style={{ ...smallBtn, width: '100%', justifyContent: 'space-between', marginBottom: 4 }}
      onClick={() => onAdd(id, purpose)}>
      <span style={{ textAlign: 'left' }}>{name}</span>
      <span className="text-xs text-gray">{detail}</span>
    </button>
  );

  return (
    <div className="mt-2" style={{ padding: 8, background: 'var(--gray-50)', borderRadius: 8 }}>
      <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
        <button type="button" {...tabBtn(purpose === 'REPOSICION')} onClick={() => setPurpose('REPOSICION')}>🔁 Reposición</button>
        <button type="button" {...tabBtn(purpose === 'REPROGRAMACION')} onClick={() => setPurpose('REPROGRAMACION')}>📆 Reprogramación</button>
      </div>
      <input className="form-input mb-2" autoFocus placeholder="Buscar estudiante o grupo…" value={q}
        onChange={(e) => setQ(e.target.value)} />
      {suggestions.length > 0 && (
        <div className="text-xs text-gray mb-1">
          Con clases por {purpose === 'REPROGRAMACION' ? 'reprogramar' : 'reponer'} sin agendar:
        </div>
      )}
      {suggestions.map(([id, o]) => row(id, o.name,
        `${(o.groups || []).join(', ')} · faltan ${purpose === 'REPROGRAMACION' ? o.reprog : o.repos}`))}
      {others.length > 0 && <div className="text-xs text-gray mb-1 mt-1">Otros estudiantes:</div>}
      {others.map((st) => row(st.id, st.name, st.groupCode || ''))}
      {suggestions.length === 0 && others.length === 0 && (
        <div className="text-xs text-gray mb-2">
          {q.trim().length < 2 ? 'Escribe al menos 2 letras para buscar a cualquier estudiante.' : 'Sin resultados.'}
        </div>
      )}
      <button type="button" className="btn btn-ghost" style={smallBtn} onClick={onCancel}>Cerrar</button>
    </div>
  );
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
  const [reprogMode, setReprogMode] = useState('student'); // 'student' | 'group'
  const [addingTo, setAddingTo] = useState(null); // `${date}|${key}` del turno donde se agrega

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

  const createGroupLink = (g, regenerate = false) => act(`glink${g.groupId}`,
    () => api.post(`/makeup-booking/admin/groups/${g.groupId}/link`, { regenerate }),
    regenerate ? `Enlace del grupo ${g.code} cambiado: el anterior ya no funciona.` : null);

  async function copyGroup(g) {
    try {
      await navigator.clipboard.writeText(groupMessage(g, data.rules));
      setNotice(`Mensaje del grupo ${g.code} copiado. Pégalo en el chat del grupo.`);
    } catch {
      window.prompt('Copia el enlace:', groupLinkFor(g.token));
    }
  }

  async function copy(s, kind) {
    try {
      await navigator.clipboard.writeText(message(s, data.rules, kind));
      setNotice(`Mensaje de ${s.name} copiado. Pégalo donde quieras enviarlo.`);
    } catch {
      window.prompt('Copia el enlace:', linkFor(s.token, kind));
    }
  }

  const slotLabelOf = (sl) => `${dayTitle(sl.date)}, ${sl.label}`;
  const addToSlot = (slot, studentId, purpose) => act(`add${slot.date}|${slot.key}`,
    () => api.post('/makeup-booking/admin/agenda/participants', { date: slot.date, slotKey: slot.key, studentId, purpose }),
    `Estudiante agregado a ${slotLabelOf(slot)}.`).then(() => setAddingTo(null));
  const removeFromSlot = (slot, p) => {
    if (!window.confirm(`¿Quitar a ${p.name} de ${slotLabelOf(slot)}? Se libera el cupo.`)) return;
    act(`rm${slot.sessionId}|${p.id}`,
      () => api.delete(`/makeup-booking/admin/agenda/${slot.sessionId}/participants/${p.id}`),
      `${p.name} salió de ${slotLabelOf(slot)}.`);
  };
  const moveToSlot = (slot, p, target) => act(`mv${slot.sessionId}|${p.id}`,
    () => api.post(`/makeup-booking/admin/agenda/${slot.sessionId}/participants/${p.id}/move`, { date: target.date, slotKey: target.key }),
    `${p.name} pasó a ${slotLabelOf(target)}.`);

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
  const canManage = data.canManage !== false;
  // Un turno se edita mientras no se haya reportado ni cancelado
  const editable = (slot) => !slot.status || slot.status === 'PROGRAMADA';
  const q = search.trim().toLowerCase();
  const kind = tab === 'reprog' ? 'reprog' : 'repos';
  const sourceList = kind === 'reprog' ? (data.reprogStudents || []) : data.students;
  const students = sourceList
    .filter((s) => !onlyToSchedule || s.toSchedule > 0)
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.groups.join(' ').toLowerCase().includes(q));
  const withoutLink = students.filter((s) => !s.token);
  const kt = KIND_TEXT[kind];
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
          <h1>📅 Agendar reposiciones y reprogramaciones</h1>
          <p className="text-xs text-gray">Los acudientes reservan desde su enlace personal, sin usuario ni contraseña. Ambas comparten los mismos turnos.</p>
        </div>
      </div>
      <div className="page-content">
        {canManage && <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button {...tabBtn(tab === 'agenda')} onClick={() => setTab('agenda')}>Agenda ({booked})</button>
          <button {...tabBtn(tab === 'links')} onClick={() => setTab('links')}>
            🔁 Enlaces reposición ({data.students.filter((s) => s.toSchedule > 0).length})
          </button>
          <button {...tabBtn(tab === 'reprog')} onClick={() => setTab('reprog')}>
            📆 Enlaces reprogramación ({(data.reprogStudents || []).filter((s) => s.toSchedule > 0).length})
          </button>
          <button {...tabBtn(tab === 'suggestions')} onClick={() => setTab('suggestions')}>
            Sugerencias ({data.suggestions.length})
          </button>
          <button {...tabBtn(tab === 'email')} onClick={() => setTab('email')}>📧 Correo semanal</button>
        </div>}

        {error && <div className="alert alert-error mb-3">{error}</div>}
        {notice && <div className="alert alert-success mb-3">{notice}</div>}

        {(tab === 'agenda' || !canManage) && (
          <>
            <p className="text-sm text-gray mb-3">
              Turnos de los próximos {data.rules.horizonDays} días (máx. {data.rules.capacity} estudiantes, todos los niveles).
              {canManage
                ? 'Cada turno reservado es una reposición normal: asígnale profesor para que le aparezca en su panel.'
                : 'Puedes agregar estudiantes a un turno o moverlos a otro. Para quitar a alguien o asignar profesor, avisa a la coordinación.'}
            </p>
            {canManage && noProfessor > 0 && (
              <div className="alert alert-error mb-3">⚠️ {noProfessor} turno{noProfessor !== 1 ? 's' : ''} con reservas sin profesor asignado.</div>
            )}
            {days.map((d) => (
              <div key={d.date} className="card mb-2">
                <div className="font-medium mb-2">{dayTitle(d.date)}</div>
                {d.slots.map((slot) => (
                  <div key={slot.key} style={{ padding: '8px 0', borderTop: '1px solid var(--gray-100)' }}>
                    <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="font-medium">
                        {slot.label}
                        {slot.dated && <span className="badge badge-blue" style={{ marginLeft: 6 }}>Fecha especial</span>}
                        {slot.ages && <span className="text-xs text-gray"> · {slot.ages}</span>}
                      </span>
                      <span className={`badge ${slot.participants.length >= slot.capacity ? 'badge-red' : slot.participants.length ? 'badge-blue' : 'badge-gray'}`}>
                        {slot.participants.length} / {slot.capacity}
                      </span>
                    </div>
                    {slot.participants.length === 0 ? (
                      <div className="text-xs text-gray">Sin reservas</div>
                    ) : (
                      <>
                        <div className="mt-1">
                          {slot.participants.map((p) => (
                            <div key={p.id} className="flex items-center justify-between" style={{ gap: 6, padding: '3px 0', flexWrap: 'wrap' }}>
                              <span className="text-sm" style={{ minWidth: 0 }}>
                                {p.name}
                                {p.reprogramming && <span title="Reprogramación (festivo o receso)"> 📆</span>}
                                {!p.bookedByParent && <span className="text-xs text-gray"> · por la Escuela</span>}
                              </span>
                              {editable(slot) && (
                                <span className="flex items-center gap-2">
                                  <select className="form-input form-select" style={{ minHeight: 30, fontSize: '0.75rem', width: 'auto', maxWidth: 170 }}
                                    value="" disabled={!!busy} title="Mover a otro turno"
                                    onChange={(e) => {
                                      const target = data.agenda.find((t) => `${t.date}|${t.key}` === e.target.value);
                                      if (target) moveToSlot(slot, p, target);
                                    }}>
                                    <option value="">↔ Mover a…</option>
                                    {data.agenda
                                      .filter((t) => `${t.date}|${t.key}` !== `${slot.date}|${slot.key}`)
                                      .map((t) => {
                                        const full = t.participants.length >= t.capacity;
                                        return (
                                          <option key={`${t.date}|${t.key}`} value={`${t.date}|${t.key}`} disabled={full}>
                                            {fmtDate(t.date, { weekday: 'short', day: 'numeric', month: 'short' })} {t.label} ({t.participants.length}/{t.capacity}{full ? ' lleno' : ''})
                                          </option>
                                        );
                                      })}
                                  </select>
                                  {canManage && (
                                    <button className="btn btn-ghost" style={{ ...smallBtn, minHeight: 30 }} disabled={!!busy}
                                      title="Quitar del turno" onClick={() => removeFromSlot(slot, p)}>✕</button>
                                  )}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
                          {canManage ? (
                            <select className="form-input form-select" style={{ flex: 1, minWidth: 180, minHeight: 36 }}
                              value={slot.professor?.id || ''} disabled={busy === `prof${slot.sessionId}`}
                              onChange={(e) => e.target.value && assignProfessor(slot, e.target.value)}>
                              <option value="">— Asignar profesor —</option>
                              {professors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          ) : (
                            <span className="text-xs text-gray">Profesor: {slot.professor?.name || 'sin asignar'}</span>
                          )}
                          {canManage && slot.professor && slot.date <= today && (
                            <Link className="btn btn-outline" style={smallBtn} to={`/makeups/${slot.sessionId}/attendance`}>
                              Reportar asistencia
                            </Link>
                          )}
                        </div>
                      </>
                    )}
                    {editable(slot) && slot.participants.length < slot.capacity && (
                      addingTo === `${slot.date}|${slot.key}` ? (
                        <AddStudentForm data={data} slot={slot} busy={busy}
                          onAdd={(studentId, purpose) => addToSlot(slot, studentId, purpose)}
                          onCancel={() => setAddingTo(null)} />
                      ) : (
                        <button className="btn btn-ghost mt-1" style={smallBtn} disabled={!!busy}
                          onClick={() => setAddingTo(`${slot.date}|${slot.key}`)}>+ Agregar estudiante</button>
                      )
                    )}
                  </div>
                ))}
              </div>
            ))}
            <p className="text-xs text-gray mb-1">📆 = reprogramación (clase no vista por festivo o receso); sin marca = reposición.</p>
            <p className="text-xs text-gray">
              Los cambios en la agenda se ven de inmediato en los cupos que ven los acudientes en sus enlaces.
              {canManage && <> Una reposición ya reportada o cancelada se edita en <Link to="/admin/makeups">Reposiciones</Link>.</>}
            </p>
          </>
        )}

        {canManage && tab === 'reprog' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button {...tabBtn(reprogMode === 'student')} onClick={() => setReprogMode('student')}>👤 Por estudiante</button>
            <button {...tabBtn(reprogMode === 'group')} onClick={() => setReprogMode('group')}>
              👥 Por grupo ({(data.reprogGroups || []).length})
            </button>
          </div>
        )}

        {canManage && tab === 'reprog' && reprogMode === 'group' && (() => {
          const groups = (data.reprogGroups || [])
            .filter((g) => !onlyToSchedule || g.toSchedule > 0)
            .filter((g) => !q || g.code.toLowerCase().includes(q) || (g.professor || '').toLowerCase().includes(q));
          return (
            <>
              <div className="alert alert-info mb-3" style={{ fontWeight: 600 }}>👥 Enlaces de reprogramación por grupo</div>
              <p className="text-sm text-gray mb-3">
                Un solo enlace por grupo, para mandarlo al chat del grupo: <strong>sirve a todos sus estudiantes</strong>.
                El acudiente abre el enlace, toca el nombre de su hijo o hija y agenda en los mismos turnos de las
                reposiciones. Solo deja agendar clases no vistas por festivos o recesos.
              </p>
              <input className="form-input mb-2" placeholder="Buscar grupo o profesor…" value={search}
                onChange={(e) => setSearch(e.target.value)} />
              <label className="flex items-center gap-2 text-sm mb-3">
                <input type="checkbox" checked={onlyToSchedule} onChange={(e) => setOnlyToSchedule(e.target.checked)} />
                Solo los grupos que aún tienen clases sin agendar
              </label>
              {groups.length === 0 && <div className="alert alert-info">No hay grupos en esta lista.</div>}
              {groups.map((g) => (
                <div key={g.groupId} className="card mb-2">
                  <div className="font-medium">Grupo {g.code}</div>
                  <div className="text-xs text-gray">
                    {g.professor && `${g.professor} · `}
                    {g.students} estudiante{g.students !== 1 ? 's' : ''} · por reprogramar {g.pending}
                    {g.reserved > 0 && ` · agendadas ${g.reserved}`}
                    {g.toSchedule > 0 ? ` · faltan ${g.toSchedule}` : ' · todo agendado ✓'}
                  </div>
                  <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
                    {!g.token ? (
                      <button className="btn btn-primary" style={smallBtn} disabled={!!busy} onClick={() => createGroupLink(g)}>
                        {busy === `glink${g.groupId}` ? 'Creando…' : '🔗 Crear enlace del grupo'}
                      </button>
                    ) : (
                      <>
                        <a className="btn btn-primary" style={smallBtn} target="_blank" rel="noreferrer"
                          title="Abre WhatsApp para elegir el chat del grupo"
                          href={`https://wa.me/?text=${encodeURIComponent(groupMessage(g, data.rules))}`}>📲 WhatsApp</a>
                        <button className="btn btn-outline" style={smallBtn} onClick={() => copyGroup(g)}>📋 Copiar mensaje</button>
                        <button className="btn btn-ghost" style={smallBtn} disabled={!!busy}
                          title="Invalida el enlace anterior del grupo"
                          onClick={() => window.confirm(`¿Cambiar el enlace del grupo ${g.code}? El anterior dejará de funcionar.`) && createGroupLink(g, true)}>
                          🔄 Cambiar enlace
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray">
                Cualquiera que tenga el enlace del grupo puede agendar por cualquier estudiante del grupo. Si se envió
                a quien no era, usa «Cambiar enlace».
              </p>
            </>
          );
        })()}

        {canManage && (tab === 'links' || (tab === 'reprog' && reprogMode === 'student')) && (
          <>
            <div className={`alert ${kind === 'reprog' ? 'alert-info' : 'alert-success'} mb-3`} style={{ fontWeight: 600 }}>
              {kt.title}
            </div>
            <p className="text-sm text-gray mb-3">
              {kt.intro} Crea su enlace personal y envíalo: <strong>WhatsApp</strong> abre
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
                        {s.groups.join(', ')} · {kt.owe} {s.pending}
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
                            href={`https://wa.me/${wa}?text=${encodeURIComponent(message(s, data.rules, kind))}`}>📲 WhatsApp</a>
                        ) : (
                          <span className="text-xs text-gray" style={{ alignSelf: 'center' }}>Sin celular</span>
                        )}
                        {s.email ? (
                          <a className="btn btn-outline" style={smallBtn}
                            href={`mailto:${s.email}?subject=${encodeURIComponent(`${kt.subject} de ${s.name} — Escuela de Tenis`)}&body=${encodeURIComponent(message(s, data.rules, kind))}`}>
                            ✉️ Correo
                          </a>
                        ) : (
                          <span className="text-xs text-gray" style={{ alignSelf: 'center' }}>Sin correo</span>
                        )}
                        <button className="btn btn-outline" style={smallBtn} onClick={() => copy(s, kind)}>📋 Copiar mensaje</button>
                        <button className="btn btn-ghost" style={smallBtn} disabled={!!busy}
                          title="Invalida el enlace anterior (por ejemplo, si se envió a quien no era)"
                          onClick={() => window.confirm(`¿Cambiar el enlace de ${s.name}? Dejarán de funcionar sus enlaces anteriores (de reposición y de reprogramación).`) && createLink(s, true)}>
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

        {canManage && tab === 'email' && <WeeklyEmailPanel />}

        {canManage && tab === 'suggestions' && (
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
