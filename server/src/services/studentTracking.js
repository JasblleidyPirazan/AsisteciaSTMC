// Seguimiento de estudiantes: una fila por estudiante con el consumo de su
// paquete de clases (Reportes → Estudiantes).
//
// Columnas de la vista:
//   Adq.    clases adquiridas del semestre + pendientes del semestre anterior
//           (misma suma que la ficha y el panel de gestión, nota 46)
//   Asist.  PRESENTE en clases regulares y festivales
//   Aus.    AUSENTE que cuenta como falta (solo desde classesStartDate, nota 46)
//   Just.   JUSTIFICADA (nunca consume paquete)
//   N/A     NO_APLICA (ni asistencia ni ausencia — no consume paquete, nota 45)
//   Rep.    PRESENTE en reposición (sesión kind=MAKEUP o registro REPOSICION)
//   Lluvia  clases de sus grupos canceladas por lluvia (informativa: no las vio
//           ni las consumió, pero explican por qué va atrasado)
//   Total   clases consumidas del paquete
//   % Av.   Total / Adq.
//
// "Consumidas" tiene dos lecturas y la vista deja elegir con `countAbsences`:
//   true  (por defecto) Asist. + Aus. + Rep. — la falta sin justificar quema la
//         clase: el estudiante la pagó y no vino.
//   false Asist. + Rep. — solo lo efectivamente visto; es la regla canónica de
//         "clase vista" de attendanceStats (PRESENTE, o AUSENTE en festival).
// En ambos casos las AUSENTE de festival ya vienen dentro de `absent`, que es
// donde attendanceStats las cuenta como clase vista.
const { absenceCounts } = require('./attendanceStats');

// Una reposición es una sesión kind=MAKEUP (reposición grupal) o un registro
// marcado REPOSICION dentro de una clase regular (estudiante invitado).
function isMakeupRecord(record) {
  return record.attendanceType === 'REPOSICION' || record.session?.kind === 'MAKEUP';
}

function emptyCounts() {
  return { present: 0, absent: 0, justified: 0, na: 0, makeup: 0, rain: 0 };
}

// Agrega los registros de asistencia de UN estudiante.
function countRecords(records, classesStartDate) {
  const c = emptyCounts();
  for (const r of records) {
    const date = r.session?.date;
    if (r.status === 'PRESENTE') {
      if (isMakeupRecord(r)) c.makeup += 1;
      else c.present += 1;
    } else if (r.status === 'AUSENTE') {
      // Una falta anterior al inicio de clases no es una falta real (nota 46).
      if (absenceCounts(date, classesStartDate)) c.absent += 1;
    } else if (r.status === 'JUSTIFICADA') {
      c.justified += 1;
    } else if (r.status === 'NO_APLICA') {
      c.na += 1;
    }
  }
  return c;
}

// Clases perdidas por lluvia: canceladas por LLUVIA en cualquiera de sus grupos,
// contadas desde su fecha de inicio de clases.
function countRain(groupIds, rainDatesByGroup, classesStartDate) {
  let n = 0;
  for (const gid of groupIds) {
    for (const date of rainDatesByGroup[gid] || []) {
      if (absenceCounts(date, classesStartDate)) n += 1;
    }
  }
  return n;
}

function primaryEnrollment(enrollments = []) {
  return enrollments.find((e) => e.enrollmentType === 'PRIMARY') || enrollments[0] || null;
}

// Función pura: recibe los datos ya leídos de la BD y arma las filas.
function buildTrackingRows({ students = [], records = [], rainDatesByGroup = {} }) {
  const byStudent = {};
  for (const r of records) (byStudent[r.studentId] ||= []).push(r);

  return students.map((s) => {
    const counts = countRecords(byStudent[s.id] || [], s.classesStartDate);
    const enrollments = s.enrollments || [];
    const primary = primaryEnrollment(enrollments);
    const groupIds = enrollments.map((e) => e.group?.id).filter(Boolean);
    // Adquiridas = las del semestre + las que quedaron pendientes del anterior.
    const acquired = (s.classesAcquired || 0) + (s.previousClasses || 0);

    return {
      id: s.id,
      name: s.name,
      document: s.document || null,
      isTrial: !!s.isTrial,
      studentStatus: s.studentStatus || null,
      missingBirthDate: !!s.missingBirthDate,
      classesStartDate: s.classesStartDate || null,
      groupCode: primary?.group?.code || null,
      groupLevel: primary?.group?.ballLevel || null,
      professor: primary?.group?.professor?.name || null,
      otherGroups: enrollments.filter((e) => e !== primary).map((e) => e.group?.code).filter(Boolean),
      acquired,
      classesAcquired: s.classesAcquired || 0,
      previousClasses: s.previousClasses || 0,
      ...counts,
      rain: countRain(groupIds, rainDatesByGroup, s.classesStartDate),
    };
  });
}

// Total consumido y % de avance. `countAbsences` decide si la falta quema clase.
function consumedTotal(row, countAbsences = true) {
  return row.present + row.makeup + (countAbsences ? row.absent : 0);
}

function progressPct(row, countAbsences = true) {
  if (!row.acquired) return null;
  return Math.round((consumedTotal(row, countAbsences) / row.acquired) * 1000) / 10;
}

module.exports = { buildTrackingRows, countRecords, countRain, consumedTotal, progressPct, isMakeupRecord };
