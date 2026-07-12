const prisma = require('../lib/prisma');
const { calculateCosts } = require('./costEngine');

// Pure diff between the professor's and the coordinator's report of the SAME
// class. A report is normalized to:
//   { dictatingProfessorId, assistantId, attendance: { [studentId]: status } }
// where `dictatingProfessorId` is the EFFECTIVE professor who taught (already
// resolved: the group titular when dictatedByOwner, otherwise the substitute).
//
// Reports MATCH when, for the union of students, every P/A/J status is equal,
// the effective dictating professor is the same, and the assistant is the same.
// Free-text justification is intentionally NOT compared (client rule).
function diffReports(prof, coord) {
  const studentIds = new Set([
    ...Object.keys(prof.attendance || {}),
    ...Object.keys(coord.attendance || {}),
  ]);

  const students = [];
  for (const studentId of studentIds) {
    const p = prof.attendance?.[studentId] ?? null;
    const c = coord.attendance?.[studentId] ?? null;
    students.push({ studentId, professor: p, coordinator: c, match: p === c });
  }

  const dictating = {
    professor: prof.dictatingProfessorId ?? null,
    coordinator: coord.dictatingProfessorId ?? null,
  };
  dictating.match = dictating.professor === dictating.coordinator;

  const assistant = {
    professor: prof.assistantId ?? null,
    coordinator: coord.assistantId ?? null,
  };
  assistant.match = assistant.professor === assistant.coordinator;

  const matched = students.every((s) => s.match) && dictating.match && assistant.match;
  return { matched, students, dictating, assistant };
}

// Effective professor who taught, per report, given the session's group.
function effectiveDictatingId(report, groupProfessorId) {
  return report.dictatedByOwner ? groupProfessorId ?? null : report.dictatingProfessorId ?? null;
}

function normalize(report, groupProfessorId) {
  const attendance = {};
  for (const a of report.attendance || []) attendance[a.studentId] = a.status;
  return {
    dictatingProfessorId: effectiveDictatingId(report, groupProfessorId),
    assistantId: report.assistantId ?? null,
    attendance,
  };
}

// Recompute the consolidation state of a session from its two staging reports.
// - Missing one report  → PENDING (no final records, no cost).
// - Both present & match → MATCHED: write the final AttendanceRecord and run the
//   cost engine (payment enabled).
// - Both present & differ → MISMATCH: store the diff, no final records/cost.
async function consolidateSession(sessionId) {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      group: { select: { professorId: true } },
      reports: { include: { attendance: true } },
    },
  });
  if (!session) throw new Error('Sesión no encontrada');

  const prof = session.reports.find((r) => r.reporterType === 'PROFESSOR');
  const coord = session.reports.find((r) => r.reporterType === 'COORDINATOR');

  // Not both reports in yet → nothing to consolidate.
  if (!prof || !coord) {
    await clearConsolidation(sessionId, 'PENDING');
    return { status: 'PENDING' };
  }

  const groupProfId = session.group?.professorId ?? null;
  const diff = diffReports(normalize(prof, groupProfId), normalize(coord, groupProfId));

  if (!diff.matched) {
    await clearConsolidation(sessionId, 'MISMATCH', await enrichDiff(diff));
    return { status: 'MISMATCH', diff };
  }

  // Matched → the professor's report becomes the consolidated source of truth.
  await prisma.attendanceRecord.deleteMany({ where: { sessionId } });
  if (prof.attendance.length > 0) {
    await prisma.attendanceRecord.createMany({
      data: prof.attendance.map((a) => ({
        sessionId,
        studentId: a.studentId,
        status: a.status,
        attendanceType: a.attendanceType || 'REGULAR',
        justification: a.justification?.slice(0, 500) || null,
        reportedById: prof.reportedById,
      })),
    });
  }

  await prisma.classSession.update({
    where: { id: sessionId },
    data: {
      status: 'REALIZADA',
      consolidationStatus: 'MATCHED',
      consolidatedAt: new Date(),
      consolidationDiff: null,
      dictatedByOwner: prof.dictatedByOwner,
      notDictatedNote: prof.dictatedByOwner ? null : prof.notDictatedNote,
      substituteProfessorId: prof.dictatedByOwner ? null : prof.dictatingProfessorId,
      assistantId: prof.assistantId ?? null,
    },
  });

  const costs = await calculateCosts(sessionId);
  return { status: 'MATCHED', costs };
}

// Non-matched states: drop any previously consolidated attendance/costs and mark
// the session as not yet realizada so it is neither counted nor payable.
async function clearConsolidation(sessionId, status, diff = null) {
  await prisma.attendanceRecord.deleteMany({ where: { sessionId } });
  await prisma.costRecord.deleteMany({ where: { sessionId } });
  await prisma.classSession.update({
    where: { id: sessionId },
    data: {
      status: 'PROGRAMADA',
      consolidationStatus: status,
      consolidationDiff: diff,
      consolidatedAt: null,
    },
  });
}

// Attach student names to a diff for display (only the divergent rows matter).
async function enrichDiff(diff) {
  const ids = diff.students.map((s) => s.studentId);
  const students = ids.length
    ? await prisma.student.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = Object.fromEntries(students.map((s) => [s.id, s.name]));
  return {
    ...diff,
    students: diff.students.map((s) => ({ ...s, name: nameById[s.studentId] || null })),
  };
}

module.exports = { consolidateSession, diffReports, effectiveDictatingId, normalize };
