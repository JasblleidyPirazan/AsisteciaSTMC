// Datos del reporte de avance de uno o varios estudiantes, además del ledger:
// la asistencia clase a clase dentro de la ventana del semestre (D4) y las
// reposiciones que ya tienen agendadas. Lo usan el correo semanal
// (routes/notifications.js) y las fichas PDF (POST /reports/students/fichas),
// así los dos muestran lo mismo.
const prisma = require('../lib/prisma');
const { dbDateStr } = require('../lib/dates');
const { findTemplate, slotLabel } = require('./makeupBooking');

/**
 * { recordsBy, reservationsBy } por studentId.
 *   window:   { from, to } de loadLedgers
 *   today:    'YYYY-MM-DD' — solo reservas desde hoy
 *   slots:    plantillas de turnos (cfg.slots) para la etiqueta de la hora
 */
async function loadProgressInputs({ studentIds, window, today, slots }) {
  if (!studentIds.length || !window) return { recordsBy: {}, reservationsBy: {} };
  const dateFilter = { gte: new Date(`${window.from}T00:00:00.000Z`) };
  if (window.to) dateFilter.lt = new Date(`${window.to}T00:00:00.000Z`);

  const [records, reservations] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { studentId: { in: studentIds }, session: { date: dateFilter } },
      select: {
        studentId: true, status: true, attendanceType: true,
        session: { select: { date: true, kind: true, title: true, effectiveUnits: true, group: { select: { code: true } } } },
      },
    }),
    prisma.makeupParticipant.findMany({
      where: {
        studentId: { in: studentIds }, reprogramming: false,
        session: { kind: 'MAKEUP', status: 'PROGRAMADA', date: { gte: new Date(`${today}T00:00:00.000Z`) } },
      },
      select: { studentId: true, session: { select: { date: true, title: true, bookingSlot: true } } },
    }),
  ]);

  const recordsBy = {};
  for (const r of records) {
    (recordsBy[r.studentId] ||= []).push({
      date: dbDateStr(r.session.date),
      kind: r.session.kind,
      title: r.session.title,
      groupCode: r.session.group?.code || null,
      units: Number(r.session.effectiveUnits) || 1,
      status: r.status,
      attendanceType: r.attendanceType,
    });
  }
  const reservationsBy = {};
  for (const p of reservations) {
    const tpl = findTemplate(p.session.bookingSlot, slots);
    (reservationsBy[p.studentId] ||= []).push({
      date: dbDateStr(p.session.date),
      label: tpl ? slotLabel(tpl) : (p.session.title || 'Reposición'),
    });
  }
  for (const list of Object.values(reservationsBy)) list.sort((a, b) => a.date.localeCompare(b.date));
  return { recordsBy, reservationsBy };
}

module.exports = { loadProgressInputs };
