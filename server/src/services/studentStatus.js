// Estados de estudiante derivados.
//
// El estado ya NO depende del checkbox manual `paymentComplete` ni de la
// asistencia (D7): se deriva de los pagos registrados (StudentPayment) contra el
// valor de su plan de clases y de si consumió su paquete. La prioridad vive en
// UN solo lugar, `studentLedger.deriveStatus`:
//
//   INACTIVO     desactivado (soft delete)
//   SUSPENDIDO   hoy dentro del rango de suspensión temporal
//   PRUEBA       estudiante de clase de prueba (isTrial)
//   GRADUADO     ya consumió todo su paquete del semestre activo (viene del
//                ledger); sale de las listas de asistencia. `graduatedOn` = fecha de fin
//   MATRICULADO  pago completo: total pagado >= valor esperado de sus clases
//   INSCRITO     pago parcial (0 < pagado < valor del plan)
//   PREINSCRITO  registrado, sin pagos
//
// `attachStudentStatus` lee el estado del ledger (`loadLedgers`). Sin semestre
// activo no hay paquete que cerrar: se deriva solo de los pagos (sin GRADUADO).
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
const { deriveStatus, loadLedgers } = require('./studentLedger');

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
// Estado SIN ledger (no hay semestre activo): solo pagos. Misma prioridad que el
// ledger porque delega en `deriveStatus`.
function deriveStudentStatus(student, { totalPaid = 0, graduated = false, cfg = TUITION_DEFAULTS, today = bogotaToday() } = {}) {
  return deriveStatus({
    active: student.active,
    suspended: isSuspendedOn(student, today),
    isTrial: student.isTrial,
    graduated,
    totalPaid,
    expectedTotal: expectedTotal(student, cfg, today),
  }).status;
}

// Decora un estudiante con el estado y el detalle de pagos del plan. `ledger`
// (si hay semestre activo) manda el estado, GRADUADO y la fecha de fin.
function decorateStudent(student, { totalPaid = 0, ledger = null, cfg = TUITION_DEFAULTS, today = bogotaToday() } = {}) {
  const category = priceCategory(student, cfg, today);
  const expected = expectedTotal(student, cfg, today);
  const studentStatus = ledger ? ledger.status : deriveStudentStatus(student, { totalPaid, cfg, today });
  return {
    ...student,
    studentStatus,
    // Estado de pago sin la graduación: un graduado que pagó completo sigue
    // siendo MATRICULADO para Contabilidad y conversión
    tuitionStatus: ledger ? ledger.tuitionStatus : studentStatus,
    // Fecha de fin de semestre: la clase con la que completó su paquete
    graduatedOn: studentStatus === 'GRADUADO' ? (ledger?.graduadoEl || null) : null,
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

// Adjunta estado + detalle de pago a una lista de estudiantes. El estado sale del
// ledger (una pasada: `loadLedgers`, sin importar el tamaño de la lista); el ledger
// vuelve a leer a los estudiantes por id, así que los objetos de entrada solo
// necesitan `id` (y los campos que se quieran conservar en la respuesta).
// `loaded` (opcional): el resultado de un `loadLedgers` que el llamador ya hizo para
// estos mismos estudiantes (p. ej. con `before`), para no leer dos veces.
async function attachStudentStatus(students, { loaded: preloaded = null } = {}) {
  if (!students || students.length === 0) return [];
  const ids = students.map((s) => s.id);
  const loaded = preloaded || await loadLedgers({ studentIds: ids });
  const ledgerById = Object.fromEntries(loaded.ledgers.map((l) => [l.studentId, l]));

  // Sin ledger (sin semestre activo): el monto pagado se lee aparte
  const withoutLedger = ids.filter((id) => !ledgerById[id]);
  let cfg = loaded.tuitionConfig;
  const paidById = {};
  if (withoutLedger.length > 0) {
    const [config, paySums] = await Promise.all([
      cfg ? Promise.resolve(cfg) : getTuitionConfig(),
      prisma.studentPayment.groupBy({ by: ['studentId'], where: { studentId: { in: withoutLedger } }, _sum: { amount: true } }),
    ]);
    cfg = config;
    for (const p of paySums) paidById[p.studentId] = parseFloat(p._sum.amount) || 0;
  }

  const today = bogotaToday();
  return students.map((s) => {
    const ledger = ledgerById[s.id] || null;
    return decorateStudent(s, {
      totalPaid: ledger ? ledger.tuition.totalPaid : (paidById[s.id] || 0),
      ledger,
      cfg,
      today,
    });
  });
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
