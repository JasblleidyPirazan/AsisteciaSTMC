const prisma = require('../lib/prisma');

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

async function calculateCosts(sessionId) {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      group: { include: { professor: true } },
      substituteProfessor: true,
      assistant: true,
      attendanceRecords: true,
    },
  });

  if (!session) throw new Error('Sesión no encontrada');
  if (!['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) return;

  const configs = await prisma.systemConfig.findMany({
    where: { key: { in: ['rate_per_student', 'assistant_fixed_rate', 'reposition_rate'] } },
  });
  const cfg = Object.fromEntries(configs.map((c) => [c.key, parseFloat(c.value)]));
  const ratePerStudent = cfg.rate_per_student || 15000;
  const assistantFixedRate = cfg.assistant_fixed_rate || 12000;
  const repositionRate = cfg.reposition_rate || ratePerStudent;

  const effectiveUnits = parseFloat(session.effectiveUnits);
  const period = getPeriodForDate(session.date);

  const regularPresent = session.attendanceRecords.filter(
    (r) => r.attendanceType === 'REGULAR' && r.status === 'PRESENTE'
  ).length;
  const repositionPresent = session.attendanceRecords.filter(
    (r) => r.attendanceType === 'REPOSICION' && r.status === 'PRESENTE'
  ).length;

  const professor = session.substituteProfessor || session.group.professor;
  const professorTotal =
    regularPresent * ratePerStudent * effectiveUnits +
    repositionPresent * repositionRate * effectiveUnits;

  // Delete previous cost records for this session before recalculating
  await prisma.costRecord.deleteMany({ where: { sessionId } });

  const records = [];

  if (professor && professorTotal > 0) {
    records.push({
      sessionId,
      professorId: professor.id,
      assistantId: null,
      payeeType: 'PROFESSOR',
      presentCount: regularPresent + repositionPresent,
      effectiveUnits: session.effectiveUnits,
      rate: ratePerStudent,
      total: professorTotal,
      period,
    });
  }

  if (session.assistant) {
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

module.exports = { calculateCosts, getCurrentPeriod, getPeriodForDate };
