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
    },
  });

  if (!session) throw new Error('Sesión no encontrada');
  if (!['REALIZADA', 'CANCELADA_MITAD'].includes(session.status)) return;

  const configs = await prisma.systemConfig.findMany({
    where: {
      key: {
        in: [
          'rate_2_students',
          'rate_3_students',
          'rate_4_students',
          'rate_5plus_students',
          'assistant_fixed_rate',
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

module.exports = { calculateCosts, getCurrentPeriod, getPeriodForDate, getBracketRate };
