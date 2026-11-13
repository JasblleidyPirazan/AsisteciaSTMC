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
const MONTH_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
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
// '2026-12-12' → '12 de diciembre'
function dayMonth(d) {
  const x = new Date(`${d}T00:00:00Z`);
  return `${x.getUTCDate()} de ${MONTH_FULL[x.getUTCMonth()]}`;
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

const SCHOOL = 'Escuela de Tenis Santa María';
const INCONSISTENCY = {
  email: 'Si tienes alguna duda o notas alguna inconsistencia en esta información, por favor responde este correo o comunícate con el Club; de lo contrario, se entiende que la información es correcta.',
  ficha: 'Si tienes alguna duda o notas alguna inconsistencia en esta información, por favor comunícate con el Club; de lo contrario, se entiende que la información es correcta.',
};
const RULES = 'Las clases canceladas por lluvia o por la Escuela y las faltas justificadas se reponen. Los festivos y recesos no se reponen: el calendario se corre y se recuperan al final.';

const STATUS_LABEL = {
  MATRICULADO: '✅ Matriculado', INSCRITO: '🔵 Inscrito', PREINSCRITO: '📝 Preinscrito', GRADUADO: '🎓 Graduado',
  PRUEBA: '🧪 Prueba', SUSPENDIDO: '⏸️ Suspendido', INACTIVO: '⛔ Inactivo',
};

/**
 * Las cifras y textos del reporte de avance de un estudiante. Una sola fuente
 * para el correo semanal y la ficha PDF: los dos dicen exactamente lo mismo.
 */
function reportParts({ ledger, records = [], semesterEnd = null }) {
  const paid = ledger.paquete.total;
  const seen = Math.min(ledger.consumidas.total, paid);
  const left = ledger.pendientes.total;
  const pct = paid > 0 ? Math.round((seen / paid) * 100) : 0;
  const rep = ledger.reposicion;
  const origin = [
    rep.lluvia > 0 && plural(rep.lluvia, 'cancelada por lluvia', 'canceladas por lluvia'),
    rep.otras > 0 && plural(rep.otras, 'cancelada por la Escuela', 'canceladas por la Escuela'),
    rep.justificadas > 0 && plural(rep.justificadas, 'falta justificada', 'faltas justificadas'),
  ].filter(Boolean);
  return {
    paid, seen, left, pct, rep, origin,
    hasMakeups: rep.pendientes > 0,
    toBook: Math.floor(rep.porAgendar || 0),
    repuestasTxt: rep.repuestas > 0 ? ` Ya repuso ${plural(rep.repuestas, 'clase', 'clases')}.` : '',
    rows: classRows({ ledger, records }),
    closing: semesterEnd
      ? `El semestre finaliza el ${dayMonth(semesterEnd)}. Participa en las jornadas de reposiciones que tendremos para completar tu paquete de clases.`
      : null,
  };
}

// ── Bloques HTML compartidos (estilos en línea: sirven en correo y en impresión) ──
const TD = 'padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;';

function avanceHtml(p) {
  const box = (value, label, color = '#111827') => `
    <td align="center" style="padding:10px 4px;background:#f9fafb;border-radius:8px;">
      <div style="font-size:22px;font-weight:700;color:${color};">${esc(fmtN(value))}</div>
      <div style="font-size:12px;color:#6b7280;">${esc(label)}</div>
    </td>`;
  return `
  <h2 style="font-size:16px;margin:8px 0;">📈 Avance</h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
    ${box(p.paid, 'clases pagadas')}${box(p.seen, 'clases recibidas', '#15803d')}${box(p.left, 'le faltan', '#b45309')}
  </tr></table>
  <div style="background:#e5e7eb;border-radius:6px;height:10px;margin:8px 0 4px;"><div style="background:#15803d;border-radius:6px;height:10px;width:${p.pct}%;"></div></div>
  <div style="font-size:12px;color:#6b7280;">${p.pct} % del paquete</div>`;
}

function reposicionesHeadHtml(p, reservations) {
  return `
  <h2 style="font-size:16px;margin:12px 0 6px;">🔁 Reposiciones</h2>
  ${p.hasMakeups
    ? `<p style="margin:4px 0;font-size:14px;">Tiene <b>${esc(plural(p.rep.pendientes, 'clase', 'clases'))} por reponer</b> (${esc(p.origin.join(', '))}).${esc(p.repuestasTxt)}</p>`
    : `<p style="margin:4px 0;font-size:14px;color:#15803d;">✔ No tiene clases por reponer.${esc(p.repuestasTxt)}</p>`}
  ${reservations.length ? `<p style="margin:8px 0 4px;font-size:14px;"><b>Ya agendadas:</b></p>
  <ul style="margin:0 0 8px;padding-left:20px;font-size:14px;">${reservations.map((r) => `<li>${esc(longDate(r.date))} · ${esc(r.label)}</li>`).join('')}</ul>` : ''}`;
}

/**
 * De dónde salen las clases que no caben antes del cierre (`pendientes.deficit`).
 * Se reparten en este orden, sin pasarse del total, así las partes siempre suman
 * el déficit:
 *   1. festivos y recesos sin agendar (`calendario.porAgendar`): las jornadas de
 *      reposición no los cubren, así que siempre terminan aquí;
 *   2. clases ya pasadas sin asistencia registrada (`sinConsolidar.clases`): no
 *      cuentan como vistas hasta que se reporten;
 *   3. el resto: no caben en su horario hasta el cierre (inicio tardío, paquete
 *      más grande que el calendario, etc.).
 */
function deficitBreakdown(ledger) {
  const deficit = ledger?.pendientes?.deficit || 0;
  if (deficit <= 0) return [];
  let left = deficit;
  const take = (n) => { const v = Math.max(0, Math.min(left, n || 0)); left = Math.round((left - v) * 10) / 10; return v; };
  const holidays = take(ledger.calendario?.porAgendar);
  const unreported = take(ledger.sinConsolidar?.clases);
  const other = left;
  return [
    holidays > 0 && { key: 'HOLIDAYS', n: holidays, text: `${plural(holidays, 'clase', 'clases')} por festivos o días de receso.` },
    unreported > 0 && { key: 'UNREPORTED', n: unreported, text: `${plural(unreported, 'clase ya dictada que aún no tiene', 'clases ya dictadas que aún no tienen')} la asistencia registrada (al registrarla, esta cifra se actualiza).` },
    other > 0 && { key: 'NO_ROOM', n: other, text: `${plural(other, 'clase que no cabe', 'clases que no caben')} en su horario regular antes del cierre del semestre.` },
  ].filter(Boolean);
}

/**
 * Apartado "Clases pendientes" de la ficha PDF. Responde, en este orden:
 *   1. ¿Cuántas le faltan?  → pendientes.total
 *   2. ¿Cómo las va a ver?  → filas que SIEMPRE suman ese total (invariante del
 *      ledger): en su horario (con las fechas) + reposiciones ya agendadas +
 *      por agendar en las jornadas de reposición + las que no alcanzan.
 *   3. ¿Por qué tiene clases por recuperar? → por reponer / por reprogramar,
 *      aclarando que ya están incluidas en el total (no se suman).
 * Todo sale del ledger.
 */
function pendingClassesHtml(ledger, semesterEnd = null, reservations = []) {
  const pend = ledger.pendientes || {};
  const rep = ledger.reposicion || {};
  const cal = ledger.calendario || {};
  const total = pend.total || 0;
  const title = '<h2 style="font-size:16px;margin:12px 0 6px;">⏳ Clases pendientes</h2>';
  if (total <= 0) {
    return `${title}<p style="margin:4px 0;font-size:14px;color:#15803d;">✔ No tiene clases pendientes: ya completó su paquete.</p>`;
  }
  const chip = (txt) => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:1px 7px;border:1px solid #d1d5db;border-radius:10px;font-size:12px;white-space:nowrap;">${esc(txt)}</span>`;
  const fechas = pend.fechasCalendario || [];
  const manyGroups = new Set(fechas.map((f) => f.groupCode)).size > 1;
  const calChips = fechas.map((f) => chip(`${shortDate(f.date)}${manyGroups && f.groupCode ? ` · ${f.groupCode}` : ''}`)).join('');
  const resChips = (reservations || []).slice(0, Math.ceil(pend.agendadasAplicadas || 0)).map((r) => chip(shortDate(r.date))).join('');
  const until = semesterEnd ? ` hasta el ${dayMonth(semesterEnd)}` : '';

  const deficit = pend.deficit || 0;
  const parts = deficitBreakdown(ledger);
  const deficitDetail = parts.length
    ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:12px;color:#374151;font-weight:400;">${parts.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>`
    : '';
  const rows = [
    { n: pend.cubreCalendario || 0, label: `En su horario regular${until}`, detail: calChips },
    { n: pend.agendadasAplicadas || 0, label: 'En reposiciones ya agendadas', detail: resChips },
    { n: pend.porAgendar || 0, label: 'Por agendar en las jornadas de reposición', detail: '' },
    {
      n: deficit,
      label: `${deficit === 1 ? 'Clase pendiente' : 'Clases pendientes'} de reprogramar. Póngase en contacto con la Escuela para coordinar la reprogramación de ${deficit === 1 ? 'esta clase' : 'estas clases'}.`,
      detail: deficitDetail,
      red: true,
    },
  ].filter((r) => r.n > 0);

  const td = 'padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;';
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;">
    <tbody>${rows.map((r) => `<tr style="page-break-inside:avoid;">
      <td style="${td}width:44px;text-align:right;font-size:16px;font-weight:700;color:${r.red ? '#b91c1c' : '#111827'};">${esc(fmtN(r.n))}</td>
      <td style="${td}${r.red ? 'color:#b91c1c;' : ''}"><b>${esc(r.label)}</b>${r.detail ? `<div style="margin-top:3px;line-height:1.8;">${r.detail}</div>` : ''}</td>
    </tr>`).join('')}
    <tr><td style="${td}text-align:right;font-size:16px;font-weight:700;border-bottom:none;">${esc(fmtN(total))}</td><td style="${td}font-weight:700;border-bottom:none;">Total que le falta</td></tr>
    </tbody></table>`;

  const reponer = rep.pendientes || 0;
  const reprogramar = cal.recuperables || 0;
  const why = (reponer > 0 || reprogramar > 0)
    ? `<p style="margin:6px 0 0;font-size:13px;color:#374151;"><b>¿Por qué tiene clases por recuperar?</b> ${[
      reponer > 0 && `${plural(reponer, 'clase', 'clases')} por reponer (lluvia, canceladas por la Escuela o faltas justificadas)`,
      reprogramar > 0 && `${plural(reprogramar, 'clase', 'clases')} por reprogramar (festivos o días de receso)`,
    ].filter(Boolean).map(esc).join(' y ')}. <span style="color:#6b7280;">Ya están incluidas en ${total === 1 ? 'la clase' : `las ${esc(fmtN(total))} clases`} que le faltan: no se suman.</span></p>`
    : '';

  return `${title}
  <p style="margin:4px 0;font-size:14px;">Le ${total === 1 ? 'falta' : 'faltan'} <b>${esc(plural(total, 'clase', 'clases'))}</b> para completar su paquete. Así las verá:</p>
  ${table}
  ${why}`;
}

function detailHtml(rows) {
  return `
  <h2 style="font-size:16px;margin:12px 0 6px;">📋 Detalle de clases</h2>
  ${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <thead><tr><th align="left" style="${TD}color:#6b7280;">Fecha</th><th align="left" style="${TD}color:#6b7280;">Clase</th><th align="left" style="${TD}color:#6b7280;">Registro</th><th align="left" style="${TD}color:#6b7280;">Qué significa</th></tr></thead>
    <tbody>${rows.map((r) => `<tr style="page-break-inside:avoid;"><td style="${TD}white-space:nowrap;">${esc(shortDate(r.date))}</td><td style="${TD}">${esc(r.label)}</td><td style="${TD}color:${TONE[r.tone]};font-weight:600;">${esc(r.mark)}</td><td style="${TD}">${esc(r.effect)}</td></tr>`).join('')}</tbody>
  </table>` : '<p style="font-size:14px;color:#6b7280;">Aún no hay clases registradas en este semestre.</p>'}`;
}

function closingHtml(p, channel, extra = '') {
  return `
  ${RULES} ${extra}
  <p style="margin:12px 0 0;font-size:13px;color:#374151;font-weight:600;">${INCONSISTENCY[channel]}</p>
  ${p.closing ? `<p style="margin:12px 0 0;font-size:14px;color:#15803d;font-weight:700;">${esc(p.closing)}</p>` : ''}`;
}

/**
 * Arma el correo de un estudiante.
 *   student:      { name, guardianName }
 *   ledger:       el ledger del estudiante (loadLedgers)
 *   records:      asistencia clase a clase (ver classRows)
 *   reservations: [{ date, label }] reposiciones ya agendadas (próximas)
 *   openSlots:    [{ date, label, free }] turnos de reposición con cupo
 *   bookingUrl:   enlace personal /reponer/:token (solo hace falta si tiene reposiciones por agendar)
 *   schoolName, semesterName, semesterEnd ('YYYY-MM-DD', fin del semestre), today
 * Devuelve { subject, html, text }.
 */
function buildProgressEmail({
  student, ledger, records = [], reservations = [], openSlots = [], bookingUrl,
  schoolName = SCHOOL, semesterName = null, semesterEnd = null, today,
}) {
  const name = student.name;
  const firstName = String(name).trim().split(/\s+/)[0];
  const greeting = student.guardianName ? `Hola, ${student.guardianName}:` : 'Hola:';
  const p = reportParts({ ledger, records, semesterEnd });
  const { paid, seen, left, pct, rep, origin, hasMakeups, toBook, repuestasTxt, rows, closing } = p;

  const subject = hasMakeups
    ? `Avance de clases de ${firstName}: ${plural(rep.pendientes, 'clase', 'clases')} por reponer`
    : `Avance de clases de ${firstName}`;
  const slots = openSlots.filter((s) => s.free > 0).slice(0, 8);

  // ── Texto plano (respaldo para lectores sin HTML) ──
  const text = [
    greeting,
    '',
    `Este es el avance de clases de ${name}${semesterName ? ` en el semestre ${semesterName}` : ''} al ${longDate(today)}.`,
    '',
    `AVANCE: ${fmtN(seen)} de ${fmtN(paid)} clases (${pct} %). Le faltan ${fmtN(left)}.`,
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
    INCONSISTENCY.email,
    closing ? '' : null,
    closing,
    '',
    schoolName,
  ].filter((l) => l !== false && l !== null).join('\n');

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

<tr><td style="padding:8px 20px;">${avanceHtml(p)}
</td></tr>

<tr><td style="padding:8px 20px;">${reposicionesHeadHtml(p, reservations)}
  ${toBook > 0 ? `<p style="margin:8px 0;font-size:14px;">Le ${toBook === 1 ? 'falta' : 'faltan'} <b>agendar ${esc(plural(toBook, 'reposición', 'reposiciones'))}</b>. Elige el turno que te sirva con este enlace personal:</p>` : ''}
  ${button}
  ${toBook > 0 && slots.length ? `<p style="margin:8px 0 4px;font-size:13px;color:#374151;">Turnos con cupo en los próximos días:</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${slots.map((s) => `
    <tr><td style="${TD}">${esc(longDate(s.date))}</td><td style="${TD}">${esc(s.label)}</td><td style="${TD}color:#6b7280;" align="right">${s.free} ${s.free === 1 ? 'cupo' : 'cupos'}</td></tr>`).join('')}
  </table>` : ''}
</td></tr>

<tr><td style="padding:8px 20px 16px;">${detailHtml(rows)}
</td></tr>

<tr><td style="padding:12px 20px 20px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">${closingHtml(p, 'email', toBook > 0 ? 'El enlace de agendamiento es personal: no lo compartas.' : '')}
  <p style="margin:12px 0 0;">${esc(schoolName)}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}

/**
 * Ficha PDF de un estudiante (Reportes → Seguimiento de Estudiantes): el mismo
 * contenido del correo semanal, sin saludo ni enlace de agendamiento, con los
 * datos de identificación arriba. Devuelve un <section> para buildFichasDocument.
 *   student: { name, document, groups: [code], professor, status }
 */
function buildStudentFicha({
  student, ledger, records = [], reservations = [],
  schoolName = SCHOOL, semesterName = null, semesterEnd = null, today,
}) {
  const p = reportParts({ ledger, records, semesterEnd });
  const ident = [
    student.document && `Documento: ${student.document}`,
    student.groups?.length && `Grupo: ${student.groups.join(', ')}`,
    student.professor && `Profesor: ${student.professor}`,
    STATUS_LABEL[student.status] || null,
  ].filter(Boolean).join(' · ');
  return `<section style="page-break-after:always;max-width:720px;margin:0 auto;padding:0 0 12px;">
  <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #15803d;padding-bottom:6px;margin-bottom:12px;">
    <div style="font-size:12px;font-weight:700;color:#15803d;">🎾 ${esc(schoolName)}</div>
    <div style="font-size:12px;color:#6b7280;">${semesterName ? `Semestre ${esc(semesterName)} · ` : ''}corte al ${esc(longDate(today))}</div>
  </div>
  <h1 style="font-size:20px;margin:0;">Avance de clases de ${esc(student.name)}</h1>
  ${ident ? `<div style="font-size:12px;color:#6b7280;margin:2px 0 8px;">${esc(ident)}</div>` : ''}
  ${avanceHtml(p)}
  ${reposicionesHeadHtml(p, reservations)}
  ${p.toBook > 0 ? `<p style="margin:8px 0;font-size:14px;">Le ${p.toBook === 1 ? 'falta' : 'faltan'} <b>agendar ${esc(plural(p.toBook, 'reposición', 'reposiciones'))}</b> (con el enlace personal que envía la Escuela).</p>` : (p.hasMakeups ? '<p style="margin:8px 0;font-size:14px;color:#15803d;font-weight:600;">✔ Todas sus reposiciones ya están agendadas.</p>' : '')}
  ${pendingClassesHtml(ledger, semesterEnd, reservations)}
  ${detailHtml(p.rows)}
  <div style="margin-top:16px;padding-top:10px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">${closingHtml(p, 'ficha')}</div>
</section>`;
}

/** Documento imprimible con varias fichas (una por página). */
function buildFichasDocument(fichas, title = 'Fichas de avance') {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; }
  section:last-child { page-break-after: auto !important; }
  thead { display: table-header-group; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>${fichas.join('')}</body></html>`;
}

module.exports = { buildProgressEmail, buildStudentFicha, buildFichasDocument, isRecipient, classRows, reportParts, pendingClassesHtml, deficitBreakdown };
