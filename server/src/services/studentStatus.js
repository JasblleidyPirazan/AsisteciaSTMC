// Estados de estudiante derivados (rediseño de estados + pagos).
//
// El estado ya NO depende del checkbox manual `paymentComplete`: se deriva de
// los datos reales del estudiante — pagos registrados (StudentPayment) y
// asistencia — contra el valor de su plan de clases:
//
//   INACTIVO     desactivado (soft delete)
//   SUSPENDIDO   hoy dentro del rango de suspensión temporal
//   PRUEBA       estudiante de clase de prueba (isTrial)
//   MATRICULADO  pago completo: total pagado >= valor esperado de sus clases
//   INSCRITO     tiene alguna clase vista (regla de attendanceStats) y/o algún pago
//   PREINSCRITO  registrado, sin asistencia ni pagos
//
// El valor esperado depende de la categoría de precio por edad:
//   ADULTO  → tuition_adult_total (valor de 40 clases) — edad >= tuition_adult_age
//   PEQUEÑO → tuition_child_total (valor de 40 clases)
// y se prorratea por las clases adquiridas: esperado = adquiridas × (total/40).
// Sin fecha de nacimiento NO se puede categorizar → el estudiante queda
// marcado con `missingBirthDate` (error visible en toda la UI) y nunca llega
// a MATRICULADO hasta que se ingrese la fecha.
const prisma = require('../lib/prisma');
const { bogotaToday } = require('../lib/dates');
const { seenAttendanceFilter } = require('./attendanceStats');

const TUITION_KEYS = ['tuition_adult_total', 'tuition_child_total', 'tuition_plan_classes', 'tuition_adult_age'];

const TUITION_DEFAULTS = {
  tuition_adult_total: 2789000,   // Valor adulto por 40 clases
  tuition_child_total: 2425000,   // Valor pequeños por 40 clases
  tuition_plan_classes: 40,       // Clases base del plan
  tuition_adult_age: 16,          // Edad (años cumplidos) desde la que aplica tarifa adulto (decisión del cliente)
};

// Edad en años cumplidos a la fecha `today` (ambos @db.Date / UTC midnight).
function ageOn(birthDate, today) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b)) return null;
  const t = new Date(today);
  let age = t.getUTCFullYear() - b.getUTCFullYear();
  if (
    t.getUTCMonth() < b.getUTCMonth() ||
    (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate())
  ) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

// 'ADULTO' | 'PEQUENO' | null (sin fecha de nacimiento no se puede categorizar)
function priceCategory(student, cfg = TUITION_DEFAULTS, today = bogotaToday()) {
  const age = ageOn(student.birthDate, today);
  if (age == null) return null;
  return age >= Number(cfg.tuition_adult_age) ? 'ADULTO' : 'PEQUENO';
}

// Valor esperado del plan del estudiante (COP) según categoría y clases
// adquiridas. null si no se puede categorizar (sin fecha de nacimiento) o si
// no tiene clases adquiridas (no hay plan contra el cual comparar).
function expectedTotal(student, cfg = TUITION_DEFAULTS, today = bogotaToday()) {
  const category = priceCategory(student, cfg, today);
  if (!category) return null;
  const classes = Number(student.classesAcquired) || 0;
  if (classes <= 0) return null;
  const planTotal = Number(category === 'ADULTO' ? cfg.tuition_adult_total : cfg.tuition_child_total);
  const planClasses = Number(cfg.tuition_plan_classes) || 40;
  return Math.round(classes * (planTotal / planClasses));
}

function isSuspendedOn(student, today) {
  return !!(
    student.suspendedFrom && student.suspendedUntil &&
    today >= new Date(student.suspendedFrom) && today <= new Date(student.suspendedUntil)
  );
}

// Deriva el estado a partir del estudiante + sus agregados (pagos/asistencia).
function deriveStudentStatus(student, { totalPaid = 0, hasAttendance = false, cfg = TUITION_DEFAULTS, today = bogotaToday() } = {}) {
  if (!student.active) return 'INACTIVO';
  if (isSuspendedOn(student, today)) return 'SUSPENDIDO';
  if (student.isTrial) return 'PRUEBA';
  const expected = expectedTotal(student, cfg, today);
  if (expected != null && totalPaid >= expected) return 'MATRICULADO';
  if (totalPaid > 0 || hasAttendance) return 'INSCRITO';
  return 'PREINSCRITO';
}

// Decora un estudiante con el estado y el detalle de pagos del plan.
function decorateStudent(student, { totalPaid = 0, hasAttendance = false, cfg = TUITION_DEFAULTS, today = bogotaToday() } = {}) {
  const category = priceCategory(student, cfg, today);
  const expected = expectedTotal(student, cfg, today);
  return {
    ...student,
    studentStatus: deriveStudentStatus(student, { totalPaid, hasAttendance, cfg, today }),
    // Error de datos: estudiante regular activo sin fecha de nacimiento — no
    // se puede saber su tarifa (adulto/pequeño). Se marca en TODAS las vistas.
    missingBirthDate: !!student.active && !student.isTrial && !student.birthDate,
    tuition: {
      category,                       // 'ADULTO' | 'PEQUENO' | null
      expectedTotal: expected,        // valor del plan (null si no aplica)
      totalPaid,                      // suma de StudentPayment
      balance: expected != null ? Math.max(0, expected - totalPaid) : null, // deuda
    },
  };
}

// Lee las tarifas de matrícula de SystemConfig (con defaults).
async function getTuitionConfig() {
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: TUITION_KEYS } } });
  const cfg = { ...TUITION_DEFAULTS };
  for (const row of rows) {
    const n = parseFloat(row.value);
    if (Number.isFinite(n) && n > 0) cfg[row.key] = n;
  }
  return cfg;
}

// Adjunta estado + detalle de pago a una lista de estudiantes (2 queries
// agregadas + config, sin importar el tamaño de la lista). Los objetos deben
// traer: id, active, isTrial, birthDate, classesAcquired, suspendedFrom/Until.
async function attachStudentStatus(students) {
  if (!students || students.length === 0) return [];
  const ids = students.map((s) => s.id);
  const [cfg, paySums, presentCounts] = await Promise.all([
    getTuitionConfig(),
    prisma.studentPayment.groupBy({
      by: ['studentId'],
      where: { studentId: { in: ids } },
      _sum: { amount: true },
    }),
    // "Al menos una asistencia" usa la regla canónica de clase vista
    // (attendanceStats): PRESENTE en cualquier sesión, o AUSENTE en festival.
    // Así el estado INSCRITO coincide con las "clases vistas" del resto del sistema.
    prisma.attendanceRecord.groupBy({
      by: ['studentId'],
      where: { studentId: { in: ids }, ...seenAttendanceFilter() },
      _count: { _all: true },
    }),
  ]);
  const paidById = Object.fromEntries(paySums.map((p) => [p.studentId, parseFloat(p._sum.amount) || 0]));
  const presentById = Object.fromEntries(presentCounts.map((p) => [p.studentId, p._count._all]));
  const today = bogotaToday();
  return students.map((s) => decorateStudent(s, {
    totalPaid: paidById[s.id] || 0,
    hasAttendance: (presentById[s.id] || 0) > 0,
    cfg,
    today,
  }));
}

// Versión para un solo estudiante.
async function attachStudentStatusOne(student) {
  const [decorated] = await attachStudentStatus([student]);
  return decorated;
}

// Roles con acceso a los montos de matrícula (tuition.*). El resto de roles
// recibe el estado (studentStatus/missingBirthDate) pero sin cifras de dinero.
const TUITION_ROLES = ['ADMIN', 'SUPERADMIN', 'RECEPTION'];

function stripTuition(students, role, extraAllowed = []) {
  if (TUITION_ROLES.includes(role) || extraAllowed.includes(role)) return students;
  return students.map(({ tuition, ...rest }) => rest);
}

module.exports = {
  TUITION_KEYS,
  TUITION_ROLES,
  stripTuition,
  TUITION_DEFAULTS,
  ageOn,
  priceCategory,
  expectedTotal,
  deriveStudentStatus,
  decorateStudent,
  getTuitionConfig,
  attachStudentStatus,
  attachStudentStatusOne,
};
