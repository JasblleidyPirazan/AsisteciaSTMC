// Estudiantes que asisten a un segundo grupo (Reportes → Otros grupos).
//
// Se calcula sobre la asistencia ya consolidada (AttendanceRecord) de clases
// REGULARES: cada PRESENTE de un estudiante en un grupo que no es su grupo
// principal es una visita a ese grupo. Suele entrar como REPOSICION (el
// profesor lo agrega desde el menú de reposición), o como REGULAR si ya está
// inscrito ahí como secundario. Las reposiciones grupales (kind=MAKEUP) y los
// festivales no tienen grupo y no cuentan.
//
// Por cada pareja estudiante + otro grupo se devuelve: veces que asistió,
// semanas distintas, días de la semana, primera y última asistencia, y si está
// inscrito formalmente en ese grupo (y desde cuándo). Que sea "regular" (umbral
// de veces/semanas) lo decide la vista, así el criterio se ajusta sin recargar.
// También salen los grupos secundarios inscritos a los que no ha asistido.

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function ymd(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// Lunes de la semana de una fecha @db.Date (UTC medianoche) → 'YYYY-MM-DD'.
function weekKey(date) {
  const d = new Date(date);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return ymd(d);
}

// Grupo principal: la primera inscripción PRIMARY (la más antigua). Sin
// PRIMARY, la inscripción más antigua de cualquier tipo.
function mainEnrollment(enrollments) {
  const sorted = [...(enrollments || [])].sort((a, b) =>
    new Date(a.enrolledAt || 0) - new Date(b.enrolledAt || 0));
  return sorted.find((e) => e.enrollmentType === 'PRIMARY') || sorted[0] || null;
}

/**
 * @param students [{ id, name, document, studentStatus?, enrollments: [{ groupId, enrollmentType, enrolledAt, group: { code, professor: { name } } }] }]
 * @param records  [{ studentId, status, attendanceType, session: { date, kind, groupId, group: { code, professor: { name } } } }]
 */
function buildSecondGroupRows({ students, records }) {
  const byStudent = new Map();
  for (const r of records) {
    if (r.status !== 'PRESENTE') continue;
    if (!r.session?.groupId || (r.session.kind && r.session.kind !== 'REGULAR')) continue;
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, []);
    byStudent.get(r.studentId).push(r);
  }

  const rows = [];
  for (const s of students) {
    const main = mainEnrollment(s.enrollments);
    const mainGroupId = main?.groupId || null;
    const enrolledIn = new Map((s.enrollments || []).map((e) => [e.groupId, e]));

    const visits = new Map(); // groupId → { group, dates[] }
    for (const r of byStudent.get(s.id) || []) {
      const gid = r.session.groupId;
      if (gid === mainGroupId) continue;
      if (!visits.has(gid)) visits.set(gid, { group: r.session.group, dates: [] });
      visits.get(gid).dates.push(r.session.date);
    }
    // Grupos secundarios inscritos sin ninguna asistencia también se listan
    for (const e of s.enrollments || []) {
      if (e.groupId !== mainGroupId && !visits.has(e.groupId)) {
        visits.set(e.groupId, { group: e.group, dates: [] });
      }
    }

    for (const [groupId, v] of visits) {
      const dates = [...new Set(v.dates.map(ymd))].sort();
      const dows = [...new Set(v.dates.map((d) => new Date(d).getUTCDay()))]
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      const enrollment = enrolledIn.get(groupId) || null;
      rows.push({
        studentId: s.id,
        name: s.name,
        document: s.document || null,
        studentStatus: s.studentStatus || null,
        mainGroupId,
        mainGroupCode: main?.group?.code || null,
        groupId,
        groupCode: v.group?.code || null,
        professor: v.group?.professor?.name || null,
        visits: dates.length,
        weeks: new Set(dates.map(weekKey)).size,
        weekdays: dows.map((d) => WEEKDAYS[d]),
        firstDate: dates[0] || null,
        lastDate: dates[dates.length - 1] || null,
        enrolled: !!enrollment,
        enrollmentType: enrollment?.enrollmentType || null,
        enrolledAt: enrollment?.enrolledAt ? ymd(enrollment.enrolledAt) : null,
      });
    }
  }

  rows.sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, 'es'));
  return rows;
}

// ¿Asiste regularmente? (mismo criterio que la vista; usado en el export)
function isRegular(row, { minVisits = 3, minWeeks = 2 } = {}) {
  return row.visits >= minVisits && row.weeks >= minWeeks;
}

module.exports = { buildSecondGroupRows, isRegular, mainEnrollment, weekKey };
