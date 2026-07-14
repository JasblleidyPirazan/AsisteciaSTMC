const prisma = require('../lib/prisma');
const { expectedDatesForGroup } = require('./schedule');
const { seenAttendanceFilter } = require('./attendanceStats');
const { notSuspended } = require('../lib/filters');
const { bogotaToday } = require('../lib/dates');

// Umbrales de alerta individual respecto del nivel ideal de avance
const RED_THRESHOLD = 4; // desviación > 4 clases → roja
const YELLOW_THRESHOLD = 2; // desviación > 2 clases → amarilla

function levelFor(deviation) {
  if (deviation > RED_THRESHOLD) return 'ROJA';
  if (deviation > YELLOW_THRESHOLD) return 'AMARILLA';
  return null;
}

/**
 * Individual attendance deviations vs the "nivel ideal de avance".
 *
 * expected = class dates of the student's groups inside the active semester up
 * to today (minus exclusions), flooring each group at the student's enrollment
 * date and the group's creation date, so mid-semester joiners aren't penalized.
 * seen = "clases vistas" (PRESENTE anywhere + AUSENTE in festivals).
 * deviation = expected − seen.
 *
 * Returns [] when there is no active semester (no baseline to compare with).
 */
async function computeAttendanceDeviations({ studentIds } = {}) {
  const semester = await prisma.semester.findFirst({
    where: { active: true },
    include: { exclusions: true },
  });
  if (!semester) return [];

  const today = bogotaToday();
  const where = { active: true, ...notSuspended(today) };
  if (studentIds) where.id = { in: studentIds };

  const students = await prisma.student.findMany({
    where,
    include: {
      enrollments: { include: { group: true } },
    },
    orderBy: { name: 'asc' },
  });
  if (students.length === 0) return [];

  // "Clases vistas" per student within the semester, in one query
  const seenRecords = await prisma.attendanceRecord.findMany({
    where: {
      studentId: { in: students.map((s) => s.id) },
      AND: [
        seenAttendanceFilter(),
        { session: { date: { gte: new Date(semester.startDate), lte: new Date(semester.endDate) } } },
      ],
    },
    select: { studentId: true },
  });
  const seenById = {};
  for (const r of seenRecords) seenById[r.studentId] = (seenById[r.studentId] || 0) + 1;

  return students.map((s) => {
    let expected = 0;
    for (const e of s.enrollments) {
      if (!e.group?.active) continue;
      // El piso incluye la fecha de inicio de clases del estudiante (si la
      // tiene), para no esperarle clases antes de que empiece.
      const floor = new Date(Math.max(
        new Date(e.enrolledAt),
        new Date(e.group.createdAt),
        ...(s.classesStartDate ? [new Date(s.classesStartDate)] : [])
      ));
      expected += expectedDatesForGroup(e.group, semester, semester.exclusions, today, floor).length;
    }
    const seen = seenById[s.id] || 0;
    const deviation = expected - seen;
    return {
      studentId: s.id,
      name: s.name,
      groups: s.enrollments.map((e) => e.group?.code).filter(Boolean),
      expected,
      seen,
      deviation,
      level: levelFor(deviation),
    };
  });
}

module.exports = { computeAttendanceDeviations, levelFor, RED_THRESHOLD, YELLOW_THRESHOLD };
