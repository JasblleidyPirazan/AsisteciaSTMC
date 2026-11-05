const XLSX = require('xlsx');
const prisma = require('../lib/prisma');
const { bogotaDateStr } = require('../lib/dates');
const { consolidateSession } = require('./consolidation');
const { calculateCosts } = require('./costEngine');
const { isSessionPeriodLocked } = require('../lib/payrollLock');

// Carga masiva de asistencia desde Excel (solo SUPERADMIN). Pensada para
// reportes que se tomaron por fuera del sistema: cada clase entra como si el
// profesor Y el coordinador la hubieran reportado igual (dos ClassReport
// idénticos → consolidación MATCHED → AttendanceRecord + costos), así nadie
// tiene que volver a reportarla. Una fila por estudiante:
//   Fecha | Grupo | Estudiante | Marca (P/A/J/NA) | Detalle? | Profesor? | Asistente?
// - Grupo "REP" = reposición grupal (ClassSession kind=MAKEUP) de esa fecha.
// - Detalle con "repone" → el estudiante va como REPOSICION en esa clase.
// - Profesor vacío → el titular del grupo; distinto del titular → sustituto.
// - Asistente vacío → sin asistente. Si viene, su pago queda confirmado (la
//   importación declara la triple coincidencia).
// - El pago NO queda suspendido por reporte tardío: la importación lo deja
//   desbloqueado a nombre de quien importa (paymentUnlocked*), con traza.
// Una clase con cualquier error (grupo/estudiante/profesor no encontrado) no se
// carga entera.
// Clases ya cargadas: se compara el archivo con lo que hay en el sistema.
//  - Sin diferencias → se omite.
//  - Con diferencias → se ACTUALIZA con lo que trae el archivo (el archivo nuevo
//    manda): marcas distintas, estudiantes que faltaban, profesor y asistente
//    distintos. Solo cuenta lo que el archivo dice: un estudiante que el
//    archivo no trae se CONSERVA (los exports salen del grupo actual y pierden a
//    quien ya cambió de grupo), y un Profesor/Asistente en blanco no borra el
//    que ya estaba. Las aprobaciones/pagos de la liquidación se conservan si el
//    monto no cambia; si cambia, el pago vuelve a pendiente y se avisa.
//  - Una clase CANCELADA en el sistema no se toca (se avisa).

const MARKS = {
  P: 'PRESENTE',
  A: 'AUSENTE',
  J: 'JUSTIFICADA',
  NA: 'NO_APLICA',
};

const MAKEUP_CODE = 'REP';

// Nombre normalizado para emparejar: minúsculas, sin tildes, espacios colapsados.
function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function normMark(v) {
  const key = String(v || '').toUpperCase().replace(/[^A-Z]/g, '');
  return MARKS[key] || null;
}

// Fecha de la celda → 'YYYY-MM-DD' (texto ISO, dd/mm/yyyy o fecha de Excel).
function normDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // cellDates entrega la fecha a medianoche local del parser; sumar 12h evita
    // que un desfase de zona horaria la corra al día anterior.
    return new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
  }
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

const HEADERS = {
  date: ['fecha'],
  group: ['grupo'],
  student: ['estudiante'],
  mark: ['marca', 'estado', 'asistencia'],
  detail: ['detalle'],
  professor: ['profesor'],
  assistant: ['asistente'],
};

// Lee la primera hoja con encabezados Fecha/Grupo/Estudiante/Marca.
function parseAttendanceRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  for (const sheetName of wb.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
    const headerIdx = matrix.findIndex((row) => (row || []).some((c) => normName(c) === 'estudiante'));
    if (headerIdx === -1) continue;
    const header = matrix[headerIdx].map(normName);
    const col = {};
    for (const [key, names] of Object.entries(HEADERS)) {
      col[key] = header.findIndex((h) => names.includes(h));
    }
    if (col.date < 0 || col.group < 0 || col.student < 0 || col.mark < 0) {
      throw new Error('La hoja debe tener los encabezados Fecha, Grupo, Estudiante y Marca');
    }
    const get = (row, key) => (col[key] >= 0 ? row[col[key]] : null);
    const rows = [];
    matrix.slice(headerIdx + 1).forEach((row, i) => {
      if (!row || row.every((c) => c == null || String(c).trim() === '')) return;
      rows.push({
        line: headerIdx + i + 2, // número de fila en Excel (1-based, con encabezado)
        date: normDate(get(row, 'date')),
        rawDate: get(row, 'date'),
        groupCode: String(get(row, 'group') || '').trim().toUpperCase(),
        studentName: String(get(row, 'student') || '').trim(),
        status: normMark(get(row, 'mark')),
        rawMark: get(row, 'mark'),
        detail: String(get(row, 'detail') || '').trim(),
        professorName: String(get(row, 'professor') || '').trim(),
        assistantName: String(get(row, 'assistant') || '').trim(),
      });
    });
    return rows;
  }
  throw new Error('No se encontró una hoja con los encabezados Fecha, Grupo, Estudiante y Marca');
}

// Agrupa las filas por clase (fecha + grupo) y valida lo que no depende de la BD.
function planClasses(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.date || r.rawDate}|${r.groupCode}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        date: r.date,
        groupCode: r.groupCode,
        isMakeup: r.groupCode === MAKEUP_CODE,
        professorNames: new Set(),
        assistantNames: new Set(),
        rows: [],
        errors: [],
      });
    }
    const cls = byKey.get(key);
    if (!r.date) cls.errors.push(`Fila ${r.line}: fecha inválida (${r.rawDate ?? 'vacía'})`);
    if (!r.groupCode) cls.errors.push(`Fila ${r.line}: falta el grupo`);
    if (!r.studentName) cls.errors.push(`Fila ${r.line}: falta el estudiante`);
    if (!r.status) cls.errors.push(`Fila ${r.line}: marca "${r.rawMark ?? ''}" no válida (usa P, A, J o NA)`);
    if (r.professorName) cls.professorNames.add(r.professorName);
    if (r.assistantName) cls.assistantNames.add(r.assistantName);
    const repone = /repone/i.test(r.detail);
    const origin = r.detail.match(/repone de\s+([A-Za-z0-9_]+)/i);
    cls.rows.push({
      line: r.line,
      studentName: r.studentName,
      status: r.status,
      // En una reposición grupal todos son participantes regulares de la sesión
      attendanceType: !cls.isMakeup && repone ? 'REPOSICION' : 'REGULAR',
      originGroupCode: origin ? origin[1].toUpperCase() : null,
    });
  }

  const classes = [];
  for (const cls of byKey.values()) {
    if (cls.professorNames.size > 1) cls.errors.push(`Más de un profesor en la misma clase: ${[...cls.professorNames].join(', ')}`);
    if (cls.assistantNames.size > 1) cls.errors.push(`Más de un asistente en la misma clase: ${[...cls.assistantNames].join(', ')}`);
    const seen = new Set();
    for (const r of cls.rows) {
      const n = normName(r.studentName);
      if (n && seen.has(n)) cls.errors.push(`${r.studentName} aparece dos veces en la misma clase`);
      seen.add(n);
    }
    classes.push({
      date: cls.date,
      groupCode: cls.groupCode,
      isMakeup: cls.isMakeup,
      professorName: [...cls.professorNames][0] || null,
      assistantName: [...cls.assistantNames][0] || null,
      rows: cls.rows,
      errors: cls.errors,
    });
  }
  classes.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.groupCode.localeCompare(b.groupCode));
  return classes;
}

// Elige al estudiante por nombre. Ante homónimos prefiere el activo y, después,
// el inscrito en el grupo de la clase (o en el grupo del que repone).
function pickStudent(candidates, preferredGroupIds) {
  if (candidates.length <= 1) return candidates[0] || null;
  let pool = candidates.filter((s) => s.active);
  if (pool.length === 1) return pool[0];
  if (pool.length === 0) pool = candidates;
  const inGroup = pool.filter((s) => s.enrollments.some((e) => preferredGroupIds.includes(e.groupId)));
  return inGroup.length === 1 ? inGroup[0] : null;
}

const STATUS_SHORT = { PRESENTE: 'P', AUSENTE: 'A', JUSTIFICADA: 'J', NO_APLICA: 'NA' };
const short = (st) => STATUS_SHORT[st] || st;
const cop = (n) => `$${Number(n).toLocaleString('es-CO')}`;

// Diferencias entre lo que ya está cargado de una clase y lo que trae el archivo.
//   current:  { records: [{ studentId, status, attendanceType }], professorId, assistantId }
//   incoming: { records, professorId, assistantId }  (professorId/assistantId null = el archivo no dice)
// Devuelve { changed, changes[], records, professorId, assistantId } donde `records` es
// lo que debe quedar: lo actual con las filas del archivo encima (no se quita a nadie).
function diffClass(current, incoming, names = {}) {
  const label = (id) => names[id] || id;
  const changes = [];
  const merged = new Map(current.records.map((r) => [r.studentId, { ...r }]));
  for (const r of incoming.records) {
    const c = merged.get(r.studentId);
    if (!c) changes.push(`${label(r.studentId)}: se agrega (${short(r.status)})`);
    else if (c.status !== r.status) changes.push(`${label(r.studentId)}: ${short(c.status)} → ${short(r.status)}`);
    else if ((c.attendanceType || 'REGULAR') !== (r.attendanceType || 'REGULAR')) {
      changes.push(`${label(r.studentId)}: ahora ${r.attendanceType === 'REPOSICION' ? 'reposición' : 'regular'}`);
    }
    merged.set(r.studentId, { studentId: r.studentId, status: r.status, attendanceType: r.attendanceType || 'REGULAR' });
  }
  const professorId = incoming.professorId || current.professorId || null;
  const assistantId = incoming.assistantId || current.assistantId || null;
  if (incoming.professorId && incoming.professorId !== (current.professorId || null)) changes.push('profesor distinto');
  if (incoming.assistantId && incoming.assistantId !== (current.assistantId || null)) changes.push('asistente distinto');
  return { changed: changes.length > 0, changes, records: [...merged.values()], professorId, assistantId };
}

// Aprobación / pago / retención de liquidación: se conservan si el pago de la misma
// persona no cambió de monto; si cambió, queda pendiente y se avisa.
async function restoreCostMarks(sessionId, oldCosts) {
  const marked = oldCosts.filter((c) => c.approvedAt || c.paidAt || c.heldAt);
  if (marked.length === 0) return [];
  const fresh = await prisma.costRecord.findMany({ where: { sessionId } });
  const warnings = [];
  for (const old of marked) {
    const who = old.professorId ? 'profesor' : 'asistente';
    const nw = fresh.find((f) => f.payeeType === old.payeeType
      && (f.professorId || null) === (old.professorId || null)
      && (f.assistantId || null) === (old.assistantId || null));
    const state = old.paidAt ? 'pagado' : old.heldAt ? 'retenido' : 'aprobado';
    if (nw && nw.payStatus === 'PAYABLE' && Number(nw.total) === Number(old.total)) {
      await prisma.costRecord.update({
        where: { id: nw.id },
        data: {
          approvedAt: old.approvedAt, approvedById: old.approvedById,
          heldAt: old.heldAt, heldById: old.heldById,
          paidAt: old.paidAt, paidById: old.paidById,
        },
      });
    } else if (nw) {
      warnings.push(`El pago del ${who} ya estaba ${state} por ${cop(old.total)} y ahora es ${cop(nw.total)}: quedó pendiente de aprobar`);
    } else {
      warnings.push(`El pago del ${who} (${state}, ${cop(old.total)}) ya no se genera con los datos nuevos`);
    }
  }
  return warnings;
}

function byName(list) {
  const map = new Map();
  for (const item of list) {
    const k = normName(item.name);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

function uniqueByName(map, name) {
  const list = map.get(normName(name)) || [];
  const active = list.filter((x) => x.active);
  if (active.length === 1) return active[0];
  return list.length === 1 ? list[0] : null;
}

// Cierre de una actualización: restituye aprobación/pago si el monto no cambió, avisa si
// cambió y deja constancia (SessionEditLog) de lo que había antes y lo que quedó.
async function finishUpdate(out, sessionId, update, records, professorId, assistantId, user) {
  out.warnings = await restoreCostMarks(sessionId, update.oldCosts.map((c) => ({ ...c })));
  await prisma.sessionEditLog.create({
    data: {
      sessionId,
      editedById: user.id,
      previousState: {
        source: 'importación de Excel',
        professorId: update.oldProfessorId, assistantId: update.oldAssistantId,
        records: update.oldRecords.map((r) => ({ studentId: r.studentId, status: r.status, attendanceType: r.attendanceType })),
        cambios: out.changes,
      },
      newState: {
        source: 'importación de Excel',
        professorId, assistantId,
        records: records.map((r) => ({ studentId: r.studentId, status: r.status, attendanceType: r.attendanceType })),
      },
    },
  });
}

async function importAttendance(buffer, { dryRun = true, user }) {
  const classes = planClasses(parseAttendanceRows(buffer));

  const [groups, professors, assistants, students] = await Promise.all([
    prisma.group.findMany({ select: { id: true, code: true, professorId: true, professor: { select: { name: true } } } }),
    prisma.professor.findMany({ select: { id: true, name: true, active: true } }),
    prisma.assistant.findMany({ select: { id: true, name: true, active: true } }),
    prisma.student.findMany({
      select: { id: true, name: true, active: true, enrollments: { select: { groupId: true } } },
    }),
  ]);
  const groupByCode = new Map(groups.map((g) => [g.code.toUpperCase(), g]));
  const profByName = byName(professors);
  const asstByName = byName(assistants);
  const studentsByName = byName(students);
  const profNameById = new Map(professors.map((p) => [p.id, p.name]));

  const results = [];
  for (const cls of classes) {
    const errors = [...cls.errors];
    const out = {
      date: cls.date,
      group: cls.groupCode,
      kind: cls.isMakeup ? 'MAKEUP' : 'REGULAR',
      professor: null,
      substitute: false,
      assistant: cls.assistantName || null,
      records: cls.rows.length,
      present: cls.rows.filter((r) => r.status === 'PRESENTE').length,
      action: 'importar',
      note: null,
      errors,
    };
    results.push(out);

    const group = cls.isMakeup ? null : groupByCode.get(cls.groupCode);
    if (!cls.isMakeup && !group) errors.push(`El grupo ${cls.groupCode} no existe en el sistema`);

    let professorId = group?.professorId || null;
    if (cls.professorName) {
      const p = uniqueByName(profByName, cls.professorName);
      if (!p) errors.push(`Profesor "${cls.professorName}" no encontrado`);
      else professorId = p.id;
    }
    out.professor = professorId ? profNameById.get(professorId) : (cls.professorName || null);
    out.substitute = !!(group && professorId && professorId !== group.professorId);

    let assistantId = null;
    if (cls.assistantName) {
      const a = uniqueByName(asstByName, cls.assistantName);
      if (!a) errors.push(`Asistente "${cls.assistantName}" no encontrado`);
      else { assistantId = a.id; out.assistant = a.name; }
    }

    const resolved = [];
    for (const r of cls.rows) {
      const candidates = studentsByName.get(normName(r.studentName)) || [];
      const preferred = [group?.id, groupByCode.get(r.originGroupCode || '')?.id].filter(Boolean);
      const st = pickStudent(candidates, preferred);
      if (!st) {
        errors.push(candidates.length
          ? `"${r.studentName}" coincide con varios estudiantes; no se puede decidir cuál`
          : `Estudiante "${r.studentName}" no encontrado`);
        continue;
      }
      resolved.push({ ...r, studentId: st.id });
    }

    if (cls.date && errors.length === 0 && await isSessionPeriodLocked(new Date(cls.date))) {
      errors.push('La quincena de esta fecha está cerrada');
    }

    // Estado actual de la clase en el sistema
    const sessionSelect = {
      id: true, status: true, consolidationStatus: true, firstReportedAt: true, assistantId: true,
      dictatedByOwner: true, substituteProfessorId: true, makeupProfessorId: true,
      reports: { select: { id: true } },
      makeupParticipants: { select: { studentId: true } },
      attendanceRecords: { select: { studentId: true, status: true, attendanceType: true } },
      costRecords: true,
    };
    const incomingRecords = resolved.map((r) => ({ studentId: r.studentId, status: r.status, attendanceType: r.attendanceType }));
    const studentNames = Object.fromEntries(students.map((st) => [st.id, st.name]));
    let existing = null;
    let update = null; // { diff, oldCosts } cuando la clase ya estaba cargada y el archivo trae diferencias
    // Compara una clase ya cargada con el archivo; el archivo manda (ver cabecera).
    const compareWithLoaded = (currentProfessorId) => {
      const diff = diffClass(
        { records: existing.attendanceRecords, professorId: currentProfessorId, assistantId: existing.assistantId },
        { records: incomingRecords, professorId: cls.professorName ? professorId : null, assistantId },
        studentNames,
      );
      if (!diff.changed) {
        out.action = 'omitir'; out.note = 'Ya está cargada igual en el sistema (sin cambios)';
        return;
      }
      out.action = 'actualizar';
      out.changes = diff.changes;
      out.note = 'Ya estaba cargada: se actualiza con lo del archivo';
      const marked = existing.costRecords.filter((c) => c.approvedAt || c.paidAt || c.heldAt);
      if (marked.length) out.note += ` · tiene ${marked.length} pago(s) aprobado(s)/pagado(s): se conservan si el monto no cambia`;
      update = {
        diff, oldCosts: existing.costRecords, oldRecords: existing.attendanceRecords,
        oldProfessorId: currentProfessorId, oldAssistantId: existing.assistantId,
      };
      professorId = diff.professorId;
      assistantId = diff.assistantId;
      out.professor = profNameById.get(professorId) || out.professor;
      out.substitute = !!(group && professorId && professorId !== group.professorId);
      out.assistant = assistants.find((a) => a.id === assistantId)?.name || out.assistant;
    };

    if (group && cls.date) {
      existing = await prisma.classSession.findUnique({
        where: { groupId_date: { groupId: group.id, date: new Date(cls.date) } },
        select: sessionSelect,
      });
      if (existing && ['CANCELADA', 'CANCELADA_MITAD'].includes(existing.status)) {
        out.action = 'omitir'; out.note = 'La clase figura como cancelada en el sistema: no se toca';
      } else if (existing?.consolidationStatus === 'MATCHED') {
        compareWithLoaded(existing.dictatedByOwner ? group.professorId : existing.substituteProfessorId);
      } else if (existing?.reports.length) {
        out.note = 'Reemplaza un reporte parcial o en conflicto';
      }
    }
    if (cls.isMakeup && cls.date && errors.length === 0) {
      const ids = resolved.map((r) => r.studentId);
      const makeups = await prisma.classSession.findMany({
        where: { kind: 'MAKEUP', date: new Date(cls.date) },
        select: sessionSelect,
      });
      // La reposición de esa fecha: la que incluye a todos los estudiantes del archivo o,
      // si cambió la lista, la que más estudiantes comparte (participantes o asistencia).
      const overlap = (m) => {
        const has = new Set([...m.makeupParticipants.map((p) => p.studentId), ...m.attendanceRecords.map((a) => a.studentId)]);
        return ids.filter((id) => has.has(id)).length;
      };
      existing = makeups.find((m) => overlap(m) === ids.length)
        || [...makeups].sort((a, b) => overlap(b) - overlap(a)).find((m) => overlap(m) > 0) || null;
      if (existing) {
        const currentProfessorId = existing.substituteProfessorId || existing.makeupProfessorId;
        out.professor = profNameById.get(currentProfessorId) || out.professor;
        professorId = cls.professorName ? professorId : currentProfessorId;
        if (existing.status === 'REALIZADA') {
          compareWithLoaded(currentProfessorId);
        } else if (['CANCELADA', 'CANCELADA_MITAD'].includes(existing.status)) {
          out.action = 'omitir'; out.note = 'La reposición figura como cancelada en el sistema: no se toca';
        } else {
          out.note = 'Reporta la reposición programada de esa fecha';
        }
      } else if (!professorId) {
        errors.push('No hay una reposición programada con estos estudiantes en esa fecha; créala en Reposiciones o indica el profesor en la columna Profesor');
      } else {
        out.note = 'Se crea la reposición (no estaba programada)';
      }
    }

    if (errors.length) { out.action = 'error'; continue; }
    if (dryRun || !['importar', 'actualizar'].includes(out.action)) continue;
    // Lo que debe quedar escrito: en una actualización, lo ya cargado con el archivo encima
    const toWrite = update ? update.diff.records : resolved;

    const now = new Date();
    const late = bogotaDateStr(now) > cls.date;
    const payFields = {
      reportedById: user.id,
      firstReportedAt: existing?.firstReportedAt || now,
      // Importación = el pago no se suspende por reporte tardío
      ...(late ? { paymentUnlockedAt: now, paymentUnlockedById: user.id } : {}),
      assistantConfirmedId: assistantId,
      assistantConfirmedAt: assistantId ? now : null,
    };

    if (cls.isMakeup) {
      const sessionId = existing?.id || (await prisma.classSession.create({
        data: {
          kind: 'MAKEUP',
          groupId: null,
          title: 'Reposición grupal (importada)',
          date: new Date(cls.date),
          status: 'PROGRAMADA',
          effectiveUnits: 1,
          makeupProfessorId: professorId,
          makeupParticipants: { create: resolved.map((r) => ({ studentId: r.studentId })) },
        },
        select: { id: true },
      })).id;
      if (existing) {
        // Quien asistió y no estaba asignado se suma como participante
        await prisma.makeupParticipant.createMany({
          data: toWrite.map((r) => ({ sessionId, studentId: r.studentId })),
          skipDuplicates: true,
        });
      }
      await prisma.attendanceRecord.deleteMany({ where: { sessionId } });
      await prisma.attendanceRecord.createMany({
        data: toWrite.map((r) => ({
          sessionId, studentId: r.studentId, status: r.status, attendanceType: 'REGULAR', reportedById: user.id,
        })),
      });
      await prisma.classSession.update({
        where: { id: sessionId },
        data: {
          ...payFields,
          status: 'REALIZADA',
          makeupProfessorId: professorId,
          // El profesor de la reposición queda en makeupProfessorId: un sustituto previo se limpia
          ...(update ? { substituteProfessorId: null } : {}),
          assistantId,
          coordinatorValidatedById: assistantId ? user.id : null,
          coordinatorValidatedAt: assistantId ? now : null,
        },
      });
      await calculateCosts(sessionId);
      if (update) await finishUpdate(out, sessionId, update, toWrite, professorId, assistantId, user);
      out.action = update ? 'actualizada' : 'importada';
      continue;
    }

    const session = existing || await prisma.classSession.create({
      data: { groupId: group.id, kind: 'REGULAR', date: new Date(cls.date), status: 'PROGRAMADA', effectiveUnits: 1 },
      select: { id: true },
    });
    await prisma.classSession.update({ where: { id: session.id }, data: payFields });

    const substitute = professorId !== group.professorId;
    const reportData = {
      reportedById: user.id,
      dictatedByOwner: !substitute,
      dictatingProfessorId: substitute ? professorId : null,
      notDictatedNote: substitute ? `Importado desde Excel: dictó ${out.professor}` : null,
      assistantId,
    };
    // Dos reportes idénticos (profesor y coordinador) → la consolidación coincide
    for (const reporterType of ['PROFESSOR', 'COORDINATOR']) {
      const report = await prisma.classReport.upsert({
        where: { sessionId_reporterType: { sessionId: session.id, reporterType } },
        update: reportData,
        create: { sessionId: session.id, reporterType, ...reportData },
      });
      await prisma.classReportAttendance.deleteMany({ where: { classReportId: report.id } });
      await prisma.classReportAttendance.createMany({
        data: toWrite.map((r) => ({
          classReportId: report.id, studentId: r.studentId, status: r.status, attendanceType: r.attendanceType || 'REGULAR',
        })),
      });
    }
    const consolidation = await consolidateSession(session.id);
    if (consolidation.status === 'MATCHED' && update) {
      await finishUpdate(out, session.id, update, toWrite, professorId, assistantId, user);
    }
    out.action = consolidation.status === 'MATCHED' ? (update ? 'actualizada' : 'importada') : 'error';
    if (consolidation.status !== 'MATCHED') errors.push(`La consolidación quedó ${consolidation.status}`);
  }

  const count = (a) => results.filter((r) => r.action === a).length;
  return {
    dryRun,
    totals: {
      classes: results.length,
      toImport: count('importar'),
      imported: count('importada'),
      toUpdate: count('actualizar'),
      updated: count('actualizada'),
      skipped: count('omitir'),
      errors: count('error'),
      records: results.filter((r) => ['importar', 'importada', 'actualizar', 'actualizada'].includes(r.action)).reduce((s, r) => s + r.records, 0),
    },
    classes: results,
  };
}

module.exports = { importAttendance, parseAttendanceRows, planClasses, pickStudent, diffClass, normMark, normDate, normName };
