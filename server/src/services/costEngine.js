import { prisma } from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Motor de costos por clase (sección 3 del documento de especificación).
//
// El cálculo del pago al profesor y al asistente ocurre automáticamente cada
// vez que se registra (envía) una sesión. Depende de:
//   - el tipo de clase (sencilla / doble) -> unidades efectivas
//   - el número de estudiantes presentes
//   - el tipo de asistencia (regular / reposición)
// ---------------------------------------------------------------------------

// Umbral de estudiantes de reposición a partir del cual se considera grupal.
const GROUP_MAKEUP_THRESHOLD = 3;

// Devuelve la quincena de una fecha: "YYYY-MM-1" (días 1-15) o "YYYY-MM-2".
export function periodForDate(date) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const half = d.getUTCDate() <= 15 ? 1 : 2;
  return `${year}-${month}-${half}`;
}

const toNumber = (value) => Number(value ?? 0);
const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Recalcula y persiste los cost_records de una sesión.
 * Borra los costos previos de la sesión y los recrea según el estado actual.
 * Solo genera costos para sesiones REALIZADA o CANCELADA_MITAD.
 *
 * @returns {Promise<{records: object[], summary: object}>}
 */
export async function recomputeSessionCosts(sessionId, tx = prisma) {
  const session = await tx.classSession.findUnique({
    where: { id: sessionId },
    include: { group: true, attendance: true },
  });
  if (!session) throw new Error(`Sesión no encontrada: ${sessionId}`);

  // Limpia costos previos de la sesión (recálculo idempotente).
  await tx.costRecord.deleteMany({ where: { sessionId } });

  // Las clases completamente canceladas no generan pago.
  if (session.status !== 'REALIZADA' && session.status !== 'CANCELADA_MITAD') {
    return { records: [], summary: emptySummary() };
  }

  const settings = await getSettings(tx);
  const studentRate = toNumber(settings.studentRate);
  const assistantRate = toNumber(settings.assistantFixedRate);
  const makeupRate = toNumber(settings.groupMakeupRate);

  const units = toNumber(session.effectiveUnits);
  const period = periodForDate(session.date);
  const professorId = session.substituteProfessorId ?? session.group.professorId;

  const present = session.attendance.filter((a) => a.status === 'PRESENTE');
  const regularPresent = present.filter((a) => a.attendanceType === 'REGULAR').length;
  const repoPresent = present.filter((a) => a.attendanceType === 'REPOSICION').length;
  const isGroupMakeup = repoPresent >= GROUP_MAKEUP_THRESHOLD;

  const records = [];

  // 1) Pago al profesor por la clase regular.
  //    Las reposiciones individuales (< umbral) se cobran a tarifa regular junto
  //    con los titulares; las grupales se liquidan aparte a tarifa de reposición.
  const billablePresent = regularPresent + (isGroupMakeup ? 0 : repoPresent);
  if (billablePresent > 0) {
    const total = round2(billablePresent * studentRate * units);
    const category =
      session.status === 'CANCELADA_MITAD'
        ? 'DOBLE_MITAD'
        : units >= 2
          ? 'REGULAR_DOBLE'
          : 'REGULAR_SENCILLA';
    records.push({
      sessionId,
      payeeId: professorId,
      payeeType: 'PROFESSOR',
      category,
      presentCount: billablePresent,
      effectiveUnits: units,
      rate: studentRate,
      total,
      period,
    });
  }

  // 2) Reposición grupal (3+ estudiantes de reposición) a tarifa diferenciada.
  if (isGroupMakeup) {
    const total = round2(repoPresent * makeupRate);
    records.push({
      sessionId,
      payeeId: professorId,
      payeeType: 'PROFESSOR',
      category: 'REPOSICION_GRUPAL',
      presentCount: repoPresent,
      effectiveUnits: 1.0,
      rate: makeupRate,
      total,
      period,
    });
  }

  // 3) Pago al asistente que acompañó la clase (tarifa fija x unidades).
  if (session.assistantId) {
    const total = round2(assistantRate * units);
    records.push({
      sessionId,
      payeeId: session.assistantId,
      payeeType: 'ASSISTANT',
      category: 'ASISTENTE',
      presentCount: 0,
      effectiveUnits: units,
      rate: assistantRate,
      total,
      period,
    });
  }

  if (records.length) {
    await tx.costRecord.createMany({ data: records });
  }

  return {
    records,
    summary: {
      present: present.length,
      absent: session.attendance.filter((a) => a.status === 'AUSENTE').length,
      justified: session.attendance.filter((a) => a.status === 'JUSTIFICADA').length,
      regularPresent,
      repoPresent,
      isGroupMakeup,
      effectiveUnits: units,
      professorTotal: round2(records.filter((r) => r.payeeType === 'PROFESSOR').reduce((s, r) => s + r.total, 0)),
      assistantTotal: round2(records.filter((r) => r.payeeType === 'ASSISTANT').reduce((s, r) => s + r.total, 0)),
    },
  };
}

/**
 * Calcula (sin persistir) el resumen de pago de una sesión a partir de datos en
 * memoria. Usado por la pantalla de resumen / vista previa antes de enviar.
 */
export function previewSessionCost({ effectiveUnits, attendance, hasAssistant, settings }) {
  const studentRate = toNumber(settings.studentRate);
  const assistantRate = toNumber(settings.assistantFixedRate);
  const makeupRate = toNumber(settings.groupMakeupRate);
  const units = toNumber(effectiveUnits);

  const present = attendance.filter((a) => a.status === 'PRESENTE');
  const regularPresent = present.filter((a) => a.attendanceType === 'REGULAR').length;
  const repoPresent = present.filter((a) => a.attendanceType === 'REPOSICION').length;
  const isGroupMakeup = repoPresent >= GROUP_MAKEUP_THRESHOLD;
  const billablePresent = regularPresent + (isGroupMakeup ? 0 : repoPresent);

  const professorRegular = round2(billablePresent * studentRate * units);
  const professorMakeup = isGroupMakeup ? round2(repoPresent * makeupRate) : 0;
  const assistantTotal = hasAssistant ? round2(assistantRate * units) : 0;

  return {
    present: present.length,
    absent: attendance.filter((a) => a.status === 'AUSENTE').length,
    justified: attendance.filter((a) => a.status === 'JUSTIFICADA').length,
    regularPresent,
    repoPresent,
    isGroupMakeup,
    effectiveUnits: units,
    studentRate,
    professorTotal: round2(professorRegular + professorMakeup),
    professorRegular,
    professorMakeup,
    assistantTotal,
    formula: `${billablePresent} presentes x ${studentRate} x ${units}`,
  };
}

function emptySummary() {
  return {
    present: 0, absent: 0, justified: 0, regularPresent: 0, repoPresent: 0,
    isGroupMakeup: false, effectiveUnits: 0, professorTotal: 0, assistantTotal: 0,
  };
}

// Devuelve la configuración de tarifas; lanza si no existe (debe correrse seed).
export async function getSettings(tx = prisma) {
  const settings = await tx.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    throw new Error('No hay configuración de tarifas. Ejecute el seed inicial.');
  }
  return settings;
}
