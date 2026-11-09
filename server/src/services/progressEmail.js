// Correo semanal de avance para acudientes (nota 66 de CLAUDE.md).
//
// Una función pura arma el correo de UN estudiante a partir de su ledger (la
// única definición del paquete), su asistencia clase a clase, sus reservas y
// los turnos de reposición con cupo. No envía nada: el envío lo hace quien
// consuma el feed (hoy, un Google Apps Script con MailApp; ver
// docs/correo-semanal.md). Así se puede cambiar de servicio de correo sin tocar
// el contenido.
//
// A quién se le escribe: `isRecipient(ledger)` — todos los estudiantes
// MATRICULADOS e INSCRITOS. Quien tiene reposiciones pendientes (lluvia,
// canceladas por la Escuela y justificadas) recibe además su enlace para agendarlas.

const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const RECIPIENT_STATUSES = new Set(['MATRICULADO', 'INSCRITO']);

/** ¿A este estudiante le llega el correo? Matriculados e inscritos. */
function isRecipient(ledger) {
  return !!ledger && RECIPIENT_STATUSES.has(ledger.status);
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// '2026-11-06' → 'vie 6 nov'
function shortDate(d) {
  const x = new Date(`${d}T00:00:00Z`);
  return `${WEEKDAY[x.getUTCDay()].slice(0, 3)} ${x.getUTCDate()} ${MONTH[x.getUTCMonth()]}`;
}
// '2026-11-06' → 'viernes 6 de nov'
function longDate(d) {
  const x = new Date(`${d}T00:00:00Z`);
  return `${WEEKDAY[x.getUTCDay()]} ${x.getUTCDate()} de ${MONTH[x.getUTCMonth()]}`;
}

const fmtN = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ','));
const plural = (n, one, many) => `${fmtN(n)} ${n === 1 ? one : many}`;

/**
 * Filas del detalle clase a clase: registros de asistencia + clases canceladas
 * que dan reposición (no tienen registro) + festivos y recesos. Más reciente primero.
 *   records: [{ date, kind, attendanceType, status, groupCode, title, units }]
 */
function classRows({ ledger, records = [] }) {
  const start = ledger.classesStartDate || null;
  const rows = records.map((r) => {
    const makeup = r.attendanceType === 'REPOSICION' || r.kind === 'MAKEUP';
    const festival = r.kind === 'FESTIVAL';
    const label = makeup ? (r.title || 'Reposición') : festival ? (r.title || 'Festival') : (r.groupCode || 'Clase');
    const u = r.units > 0 ? r.units : 1;
    let mark;
    let effect;
    if (r.status === 'PRESENTE') {
      mark = 'Asistió';
      effect = makeup ? `Repone ${plural(u, 'clase', 'clases')}` : 'Clase vista';
    } else if (r.status === 'AUSENTE') {
      mark = makeup ? 'Faltó a la reposición' : 'No asistió';
      if (start && r.date < start) effect = 'No cuenta (antes del inicio de clases)';
      else effect = makeup ? 'Reposición perdida' : 'Cuenta como clase recibida';
    } else if (r.status === 'JUSTIFICADA') {
      mark = 'Justificada';
      effect = !makeup && !festival && (!start || r.date >= start) ? 'Da derecho a reposición' : 'No cuenta';
    } else {
      mark = 'No aplica';
      effect = 'No cuenta';
    }
    return { date: r.date, label, mark, effect, tone: toneFor(r.status, makeup) };
  });
  for (const it of ledger.reposicion?.items || []) {
    if (it.type === 'JUSTIFIED') continue; // ya está como registro
    rows.push({
      date: it.date,
      label: it.groupCode || 'Clase',
      mark: it.type === 'RAIN' ? 'Cancelada por lluvia' : 'Cancelada por la Escuela',
      effect: 'Da derecho a reposición',
      tone: 'repo',
    });
  }
  for (const it of ledger.calendario?.items || []) {
    rows.push({
      date: it.date,
      label: it.groupCode || 'Clase',
      mark: it.reason ? `Festivo / receso (${it.reason})` : 'Festivo / receso',
      effect: 'Se reprograma en el calendario',
      tone: 'muted',
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

function toneFor(status, makeup) {
  if (status === 'PRESENTE') return 'ok';
  if (status === 'AUSENTE') return 'bad';
  if (status === 'JUSTIFICADA' && !makeup) return 'repo';
  return 'muted';
}

const TONE = {
  ok: '#15803d', bad: '#b91c1c', repo: '#b45309', muted: '#6b7280',
};

/**
 * Arma el correo de un estudiante.
 *   student:      { name, guardianName }
 *   ledger:       el ledger del estudiante (loadLedgers)
 *   records:      asistencia clase a clase (ver classRows)
 *   reservations: [{ date, label }] reposiciones ya agendadas (próximas)
 *   openSlots:    [{ date, label, free }] turnos de reposición con cupo
 *   bookingUrl:   enlace personal /reponer/:token (solo hace falta si tiene reposiciones por agendar)
 *   schoolName, semesterName, today
 * Devuelve { subject, html, text }.
 */
function buildProgressEmail({
  student, ledger, records = [], reservations = [], openSlots = [], bookingUrl,
  schoolName = 'Escuela de Tenis Santa María', semesterName = null, today,
}) {
  const name = student.name;
  const firstName = String(name).trim().split(/\s+/)[0];
  const greeting = student.guardianName ? `Hola, ${student.guardianName}:` : 'Hola:';
  const paid = ledger.paquete.total;
  const seen = Math.min(ledger.consumidas.total, paid);
  const left = ledger.pendientes.total;
  const pct = paid > 0 ? Math.round((seen / paid) * 100) : 0;
  const rep = ledger.reposicion;
  const toBook = Math.floor(rep.porAgendar || 0);
  const fin = ledger.proyeccion?.fin || null;

  const hasMakeups = rep.pendientes > 0;
  const subject = hasMakeups
    ? `Avance de clases de ${firstName}: ${plural(rep.pendientes, 'clase', 'clases')} por reponer`
    : `Avance de clases de ${firstName}`;

  const origin = [
    rep.lluvia > 0 && plural(rep.lluvia, 'cancelada por lluvia', 'canceladas por lluvia'),
    rep.otras > 0 && plural(rep.otras, 'cancelada por la Escuela', 'canceladas por la Escuela'),
    rep.justificadas > 0 && plural(rep.justificadas, 'falta justificada', 'faltas justificadas'),
  ].filter(Boolean);
  const repuestasTxt = rep.repuestas > 0 ? ` Ya repuso ${plural(rep.repuestas, 'clase', 'clases')}.` : '';

  const rows = classRows({ ledger, records });
  const slots = openSlots.filter((s) => s.free > 0).slice(0, 8);

  // ── Texto plano (respaldo para lectores sin HTML) ──
  const text = [
    greeting,
    '',
    `Este es el avance de clases de ${name}${semesterName ? ` en el semestre ${semesterName}` : ''} al ${longDate(today)}.`,
    '',
    `AVANCE: ${fmtN(seen)} de ${fmtN(paid)} clases (${pct} %). Le faltan ${fmtN(left)}.${fin ? ` Fecha estimada de fin: ${longDate(fin)}.` : ''}`,
    '',
    hasMakeups
      ? `REPOSICIONES: ${plural(rep.pendientes, 'clase', 'clases')} por reponer (${origin.join(', ')}).${repuestasTxt}`
      : `REPOSICIONES: no tiene clases por reponer.${repuestasTxt}`,
    reservations.length ? `Ya agendadas: ${reservations.map((r) => `${longDate(r.date)}, ${r.label}`).join('; ')}` : '',
    toBook > 0 ? `Le falta agendar ${plural(toBook, 'reposición', 'reposiciones')}. Agéndalas aquí: ${bookingUrl}` : (hasMakeups ? 'Todas sus reposiciones ya están agendadas.' : ''),
    toBook > 0 && slots.length ? `Turnos con cupo: ${slots.map((s) => `${shortDate(s.date)} ${s.label} (${s.free} ${s.free === 1 ? 'cupo' : 'cupos'})`).join('; ')}` : '',
    '',
    'DETALLE DE CLASES:',
    ...rows.map((r) => `- ${shortDate(r.date)} · ${r.label} · ${r.mark} · ${r.effect}`),
    '',
    toBook > 0 ? `Este enlace es personal: ${bookingUrl}` : '',
    '',
    'Si tienes alguna duda o notas alguna inconsistencia en esta información, por favor responde este correo o comunícate con el Club; de lo contrario, se entiende que la información es correcta.',
    '',
    schoolName,
  ].filter((l) => l !== false && l !== null).join('\n');

  // ── HTML (estilos en línea: los clientes de correo ignoran <style>) ──
  const td = 'padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;';
  const box = (value, label, color = '#111827') => `
    <td align="center" style="padding:10px 4px;background:#f9fafb;border-radius:8px;">
      <div style="font-size:22px;font-weight:700;color:${color};">${esc(fmtN(value))}</div>
      <div style="font-size:12px;color:#6b7280;">${esc(label)}</div>
    </td>`;
  const button = !hasMakeups ? '' : toBook > 0 ? `
    <p style="text-align:center;margin:18px 0;">
      <a href="${esc(bookingUrl)}" style="background:#15803d;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block;">
        Agendar ${toBook === 1 ? 'mi reposición' : `mis ${toBook} reposiciones`}
      </a>
    </p>` : `
    <p style="margin:12px 0;color:#15803d;font-weight:600;">✔ Todas sus reposiciones ya están agendadas.</p>`;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;">
<tr><td style="padding:20px 20px 8px;">
  <div style="font-size:12px;color:#6b7280;">${esc(schoolName)}</div>
  <h1 style="font-size:20px;margin:4px 0 0;">Avance de clases de ${esc(name)}</h1>
  <div style="font-size:12px;color:#6b7280;">${semesterName ? `Semestre ${esc(semesterName)} · ` : ''}corte al ${esc(longDate(today))}</div>
</td></tr>
<tr><td style="padding:8px 20px;font-size:14px;">
  <p style="margin:8px 0;">${esc(greeting)}</p>
  <p style="margin:8px 0;">Te compartimos cómo va ${esc(firstName)} con su paquete de clases${hasMakeups ? ' y las reposiciones que tiene pendientes' : ''}.</p>
</td></tr>

<tr><td style="padding:8px 20px;">
  <h2 style="font-size:16px;margin:8px 0;">📈 Avance</h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
    ${box(paid, 'clases pagadas')}${box(seen, 'clases recibidas', '#15803d')}${box(left, 'le faltan', '#b45309')}
  </tr></table>
  <div style="background:#e5e7eb;border-radius:6px;height:10px;margin:8px 0 4px;"><div style="background:#15803d;border-radius:6px;height:10px;width:${pct}%;"></div></div>
  <div style="font-size:12px;color:#6b7280;">${pct} % del paquete${fin ? ` · fecha estimada de fin: <b>${esc(longDate(fin))}</b>` : ''}</div>
</td></tr>

<tr><td style="padding:8px 20px;">
  <h2 style="font-size:16px;margin:12px 0 6px;">🔁 Reposiciones</h2>
  ${hasMakeups
    ? `<p style="margin:4px 0;font-size:14px;">Tiene <b>${esc(plural(rep.pendientes, 'clase', 'clases'))} por reponer</b> (${esc(origin.join(', '))}).${esc(repuestasTxt)}</p>`
    : `<p style="margin:4px 0;font-size:14px;color:#15803d;">✔ No tiene clases por reponer.${esc(repuestasTxt)}</p>`}
  ${reservations.length ? `<p style="margin:8px 0 4px;font-size:14px;"><b>Ya agendadas:</b></p>
  <ul style="margin:0 0 8px;padding-left:20px;font-size:14px;">${reservations.map((r) => `<li>${esc(longDate(r.date))} · ${esc(r.label)}</li>`).join('')}</ul>` : ''}
  ${toBook > 0 ? `<p style="margin:8px 0;font-size:14px;">Le ${toBook === 1 ? 'falta' : 'faltan'} <b>agendar ${esc(plural(toBook, 'reposición', 'reposiciones'))}</b>. Elige el turno que te sirva con este enlace personal:</p>` : ''}
  ${button}
  ${toBook > 0 && slots.length ? `<p style="margin:8px 0 4px;font-size:13px;color:#374151;">Turnos con cupo en los próximos días:</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${slots.map((s) => `
    <tr><td style="${td}">${esc(longDate(s.date))}</td><td style="${td}">${esc(s.label)}</td><td style="${td}color:#6b7280;" align="right">${s.free} ${s.free === 1 ? 'cupo' : 'cupos'}</td></tr>`).join('')}
  </table>` : ''}
</td></tr>

<tr><td style="padding:8px 20px 16px;">
  <h2 style="font-size:16px;margin:12px 0 6px;">📋 Detalle de clases</h2>
  ${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><th align="left" style="${td}color:#6b7280;">Fecha</th><th align="left" style="${td}color:#6b7280;">Clase</th><th align="left" style="${td}color:#6b7280;">Registro</th><th align="left" style="${td}color:#6b7280;">Qué significa</th></tr>
    ${rows.map((r) => `<tr><td style="${td}white-space:nowrap;">${esc(shortDate(r.date))}</td><td style="${td}">${esc(r.label)}</td><td style="${td}color:${TONE[r.tone]};font-weight:600;">${esc(r.mark)}</td><td style="${td}">${esc(r.effect)}</td></tr>`).join('')}
  </table>` : '<p style="font-size:14px;color:#6b7280;">Aún no hay clases registradas en este semestre.</p>'}
</td></tr>

<tr><td style="padding:12px 20px 20px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">
  Las clases canceladas por lluvia o por la Escuela y las faltas justificadas se reponen. Los festivos y recesos no se reponen: el calendario se corre y se recuperan al final.
  ${toBook > 0 ? 'El enlace de agendamiento es personal: no lo compartas.' : ''}
  <p style="margin:12px 0 0;font-size:13px;color:#374151;font-weight:600;">Si tienes alguna duda o notas alguna inconsistencia en esta información, por favor responde este correo o comunícate con el Club; de lo contrario, se entiende que la información es correcta.</p>
  <p style="margin:12px 0 0;">${esc(schoolName)}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}

module.exports = { buildProgressEmail, isRecipient, classRows };
