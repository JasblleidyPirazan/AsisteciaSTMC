const prisma = require('../lib/prisma');
const { bogotaDateStr, dbDateStr } = require('../lib/dates');

function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const half = now.getDate() <= 15 ? '1' : '2';
  return `${year}-${month}-${half}`;
}

function getPeriodForDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const half = d.getDate() <= 15 ? '1' : '2';
  return `${year}-${month}-${half}`;
}

// Returns the flat bracket rate for the given number of students present.
// The rate is a fixed amount per session (not per student).
function getBracketRate(presentCount, cfg) {
  if (presentCount <= 0) return 0;
  if (presentCount <= 2) return parseFloat(cfg.rate_2_students || 30000);
  if (presentCount === 3) return parseFloat(cfg.rate_3_students || 45000);
  if (presentCount === 4) return parseFloat(cfg.rate_4_students || 60000);
  return parseFloat(cfg.rate_5plus_students || 75000);
}

async function calculateCosts(sessionId) {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      group: { include: { professor: true } },
      makeupProfessor: true,
      substituteProfessor: true,
      assistant: true,
      attendanceRecords: true,
      festivalProfessors: true,
    },
  });

  if (!session) throw new Error('Sesión no encontrada');
  if (!['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) return;

  // Festivals pay every participating professor the SAME fixed amount defined
  // at creation (pago igualitario) — no bracket, no assistant, always PAYABLE
  // (the coordinator reports it, so late-report suspension doesn't apply).
  if (session.kind === 'FESTIVAL') {
    const festivalRate = parseFloat(session.festivalRate || 0);
    // Present AND absent both count; justified absences are omitted
    const countedAttendance = session.attendanceRecords.filter(
      (r) => r.status === 'PRESENTE' || r.status === 'AUSENTE'
    ).length;
    const period = getPeriodForDate(session.date);

    await prisma.costRecord.deleteMany({ where: { sessionId } });

    if (festivalRate > 0 && session.festivalProfessors.length > 0) {
      await prisma.costRecord.createMany({
        data: session.festivalProfessors.map((fp) => ({
          sessionId,
          professorId: fp.professorId,
          assistantId: null,
          payeeType: 'PROFESSOR',
          presentCount: countedAttendance,
          effectiveUnits: session.effectiveUnits,
          rate: festivalRate,
          total: festivalRate,
          period,
          payStatus: 'PAYABLE',
        })),
      });
    }

    return {
      professorTotal: festivalRate,
      professorCount: session.festivalProfessors.length,
      assistantTotal: 0,
    };
  }

  const configs = await prisma.systemConfig.findMany({
    where: {
      key: {
        in: [
          'rate_2_students',
          'rate_3_students',
          'rate_4_students',
          'rate_5plus_students',
          'assistant_fixed_rate',
          'assistant_match_start_date',
        ],
      },
    },
  });
  const cfg = Object.fromEntries(configs.map((c) => [c.key, c.value]));

  const assistantFixedRate = parseFloat(cfg.assistant_fixed_rate || 12000);

  const effectiveUnits = parseFloat(session.effectiveUnits);
  const period = getPeriodForDate(session.date);

  // Payment is based solely on the number of students present, regardless of
  // whether they attend as a regular class or as a make-up (reposición).
  const presentCount = session.attendanceRecords.filter(
    (r) => r.status === 'PRESENTE'
  ).length;

  const bracketRate = getBracketRate(presentCount, cfg);
  // Regular classes derive the professor from the group; makeup classes have no
  // group and carry their assigned professor directly in makeupProfessor.
  const professor =
    session.substituteProfessor || session.group?.professor || session.makeupProfessor;
  const professorTotal = bracketRate * effectiveUnits;

  // Pay suspension for late reports: a class not reported the SAME DAY it was
  // dictated (America/Bogota) is auto-suspended; only ADMIN can unlock it.
  // payStatus is derived from session fields (never stored only on the cost
  // record) because this engine deletes and recreates records on every edit.
  // Historical sessions have firstReportedAt = null → never marked late.
  const isLate =
    session.firstReportedAt != null &&
    bogotaDateStr(session.firstReportedAt) > dbDateStr(session.date);
  const professorPayStatus =
    isLate && !session.paymentUnlockedAt ? 'SUSPENDED_LATE' : 'PAYABLE';

  // Delete previous cost records for this session before recalculating
  await prisma.costRecord.deleteMany({ where: { sessionId } });

  const records = [];

  if (professor && bracketRate > 0) {
    records.push({
      sessionId,
      professorId: professor.id,
      assistantId: null,
      payeeType: 'PROFESSOR',
      presentCount,
      effectiveUnits: session.effectiveUnits,
      rate: bracketRate,
      total: professorTotal,
      period,
      payStatus: professorPayStatus,
    });
  }

  if (session.assistant) {
    // Triple coincidence rule: the assistant's pay turns "green" (PAYABLE) only
    // when the professor's report, the assistant's confirmation and the
    // coordinator's validation all point to the SAME assistant. Sessions dated
    // before the deployment cutoff stay PAYABLE so editing old sessions never
    // retains pay that was already settled.
    const matchStart = cfg.assistant_match_start_date || null;
    const beforeCutoff = matchStart && dbDateStr(session.date) < matchStart;
    const tripleMatch =
      session.assistantConfirmedId === session.assistantId &&
      !!session.coordinatorValidatedAt;
    const assistantPayStatus = beforeCutoff || tripleMatch ? 'PAYABLE' : 'PENDING_MATCH';

    const assistantTotal = assistantFixedRate * effectiveUnits;
    records.push({
      sessionId,
      professorId: null,
      assistantId: session.assistant.id,
      payeeType: 'ASSISTANT',
      presentCount: 0,
      effectiveUnits: session.effectiveUnits,
      rate: assistantFixedRate,
      total: assistantTotal,
      period,
      payStatus: assistantPayStatus,
    });
  }

  if (records.length > 0) {
    await prisma.costRecord.createMany({ data: records });
  }

  return {
    professorTotal,
    assistantTotal: session.assistant ? assistantFixedRate * effectiveUnits : 0,
  };
}

module.exports = { calculateCosts, getCurrentPeriod, getPeriodForDate, getBracketRate };
