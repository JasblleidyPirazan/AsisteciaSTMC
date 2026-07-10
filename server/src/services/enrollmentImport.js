/**
 * Lógica de importación de matrícula desde el Excel de preinscripción.
 * Compartida por el script de terminal (src/scripts/importEnrollment.js) y por
 * el endpoint del admin (POST /students/import).
 *
 * Fuente: hoja "Consolidado Matrícula".
 */
const XLSX = require('xlsx');
const prisma = require('../lib/prisma');

// ---------- helpers de parseo ----------

const COLOR = { rojo: 'Roja', roja: 'Roja', naranja: 'Naranja', verde: 'Verde', amarillo: 'Amarilla', amarilla: 'Amarilla' };

function parseLevel(nivel) {
  const t = String(nivel || '').trim();
  if (!t) return { ballLevel: null, subLevel: null };
  const parts = t.split(/\s+/);
  const first = parts[0].toLowerCase();
  if (COLOR[first]) {
    const sub = parts[1] && /^[abc]$/i.test(parts[1]) ? parts[1].toUpperCase() : null;
    return { ballLevel: COLOR[first], subLevel: sub };
  }
  const cap = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  return { ballLevel: cap, subLevel: null };
}

// Tokens de día del archivo: "L,M" (Lun-Mié), "Ma,J" (Mar-Jue), "V", "Sab"
const DAYTOK = {
  l: 'lunes', m: 'miercoles', ma: 'martes', mi: 'miercoles',
  j: 'jueves', v: 'viernes', s: 'sabado', sab: 'sabado', 'sáb': 'sabado', d: 'domingo',
};

function parseDays(diasStr, code) {
  const out = { lunes: false, martes: false, miercoles: false, jueves: false, viernes: false, sabado: false, domingo: false };
  const toks = String(diasStr || '').split(/[,/\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  let any = false;
  for (const tk of toks) {
    const d = DAYTOK[tk];
    if (d) { out[d] = true; any = true; }
  }
  if (!any && code) {
    const p = String(code).toUpperCase();
    if (p.startsWith('LM')) { out.lunes = out.miercoles = true; }
    else if (p.startsWith('MJ')) { out.martes = out.jueves = true; }
    else if (p.startsWith('J')) { out.martes = out.jueves = true; }
    else if (p.startsWith('V')) { out.viernes = true; }
    else if (p.startsWith('S')) { out.sabado = true; }
  }
  return out;
}

function parseHorario(h) {
  const m = String(h || '').match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return { startTime: '00:00', endTime: '00:00', durationMinutes: 0 };
  const startTime = `${m[1].padStart(2, '0')}:${m[2]}`;
  const endTime = `${m[3].padStart(2, '0')}:${m[4]}`;
  const durationMinutes = (parseInt(m[3]) * 60 + parseInt(m[4])) - (parseInt(m[1]) * 60 + parseInt(m[2]));
  return { startTime, endTime, durationMinutes };
}

function excelDate(v) {
  if (v === '' || v == null) return null;
  if (v instanceof Date) return v;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
}

function clean(v) {
  const s = String(v == null ? '' : v).trim();
  return s || null;
}

// ---------- parseo del libro ----------

function parseRecords(wb) {
  const sheetName = wb.SheetNames.find((n) => /consolidado/i.test(n));
  if (!sheetName) throw new Error('No se encontró la hoja "Consolidado Matrícula" en el archivo.');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  const hIdx = rows.findIndex((r) => r.includes('NOMBRE COMPLETO'));
  if (hIdx < 0) throw new Error('No se encontró la fila de encabezados (NOMBRE COMPLETO).');
  const header = rows[hIdx];
  const col = (name) => header.indexOf(name);
  const idx = {
    name: col('NOMBRE COMPLETO'), code: col('CÓDIGO GRUPO'), level: col('NIVEL'),
    prof: col('PROFESOR'), horario: col('HORARIO'), dias: col('DÍAS'),
    doc: col('Documento'), birth: col('Fecha de nacimiento'), wa: col('Número de WA'),
    guardian: col('Acudiente'), email: col('Correo electrónico'), start: col('Fecha de inicio'),
    pago: col('Estado de pago'),
  };
  return rows.slice(hIdx + 1)
    .filter((r) => clean(r[idx.name]))
    .map((r) => ({
      name: clean(r[idx.name]),
      code: clean(r[idx.code]),
      level: clean(r[idx.level]),
      professor: clean(r[idx.prof]),
      horario: clean(r[idx.horario]),
      dias: clean(r[idx.dias]),
      document: clean(r[idx.doc]),
      birthDate: excelDate(r[idx.birth]),
      phone: clean(r[idx.wa]),
      guardianName: clean(r[idx.guardian]),
      email: clean(r[idx.email]),
      startDate: excelDate(r[idx.start]),
      paymentComplete: (Number(r[idx.pago]) || 0) > 0,
    }));
}

// ---------- importación ----------

/**
 * Importa desde un Buffer de Excel. Devuelve un resumen estructurado.
 * @param {Buffer} buffer
 * @param {{dryRun?: boolean}} opts
 */
async function importFromBuffer(buffer, { dryRun = false } = {}) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const records = parseRecords(wb);

  // Agrupar por estudiante (documento, o nombre si no hay documento)
  const byStudent = new Map();
  for (const r of records) {
    const key = r.document || `name:${r.name.toLowerCase()}`;
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(r);
  }
  const profNames = [...new Set(records.map((r) => r.professor).filter(Boolean))];
  const groupCodes = [...new Set(records.map((r) => r.code).filter(Boolean))];
  const multiGroup = [...byStudent.values()].filter((r) => r.length > 1).length;

  const counts = {
    records: records.length,
    students: byStudent.size,
    groups: groupCodes.length,
    professors: profNames.length,
    multiGroup,
  };

  if (dryRun) {
    const groupSamples = groupCodes.slice(0, 5).map((code) => {
      const r = records.find((x) => x.code === code);
      const lvl = parseLevel(r.level);
      const days = parseDays(r.dias, code);
      const hr = parseHorario(r.horario);
      return { code, ...lvl, horario: `${hr.startTime}-${hr.endTime}`, professor: r.professor, days: Object.keys(days).filter((d) => days[d]) };
    });
    const studentSamples = [...byStudent.values()].slice(0, 5).map((recs) => {
      const r = recs[0];
      return { name: r.name, document: r.document, email: r.email, phone: r.phone, guardianName: r.guardianName, paymentComplete: r.paymentComplete, groups: recs.map((x) => x.code) };
    });
    return { dryRun: true, counts, professors: profNames, samples: { groups: groupSamples, students: studentSamples } };
  }

  // 1) Profesores (upsert por nombre)
  const profByName = {};
  for (const name of profNames) {
    let p = await prisma.professor.findFirst({ where: { name } });
    if (!p) p = await prisma.professor.create({ data: { name } });
    profByName[name] = p.id;
  }

  // 2) Grupos (upsert por código)
  const groupByCode = {};
  const warnings = [];
  for (const code of groupCodes) {
    const r = records.find((x) => x.code === code);
    const { ballLevel, subLevel } = parseLevel(r.level);
    const days = parseDays(r.dias, code);
    const { startTime, endTime, durationMinutes } = parseHorario(r.horario);
    const professorId = profByName[r.professor];
    if (!professorId) { warnings.push(`Grupo ${code} sin profesor válido (${r.professor}); se omite`); continue; }
    const data = {
      professorId, ...days, startTime, endTime, durationMinutes,
      classUnits: 1.0, ballLevel, subLevel,
      name: [ballLevel, subLevel].filter(Boolean).join(' ') || null,
    };
    const g = await prisma.group.upsert({ where: { code }, create: { code, ...data }, update: data });
    groupByCode[code] = g.id;
  }

  // 3) Estudiantes + matrículas
  let created = 0, updated = 0, moved = 0;
  for (const recs of byStudent.values()) {
    const r0 = recs[0];
    let student = r0.document
      ? await prisma.student.findFirst({ where: { document: r0.document } })
      : await prisma.student.findFirst({ where: { name: r0.name, active: true } });

    const base = {
      name: r0.name,
      email: r0.email,
      document: r0.document,
      phone: r0.phone,
      guardianName: r0.guardianName,
      birthDate: r0.birthDate,
      paymentComplete: r0.paymentComplete,
    };

    if (student) {
      student = await prisma.student.update({ where: { id: student.id }, data: base });
      updated++;
    } else {
      student = await prisma.student.create({ data: { ...base, classesAcquired: 0 } });
      created++;
    }

    const existing = await prisma.studentEnrollment.findMany({ where: { studentId: student.id } });
    for (let i = 0; i < recs.length; i++) {
      const code = recs[i].code;
      const groupId = code ? groupByCode[code] : null;
      if (!groupId) continue;
      const type = i === 0 ? 'PRIMARY' : 'SECONDARY';
      if (type === 'PRIMARY') {
        for (const e of existing) {
          if (e.enrollmentType === 'PRIMARY' && e.groupId !== groupId) {
            await prisma.studentEnrollment.delete({ where: { studentId_groupId: { studentId: student.id, groupId: e.groupId } } });
            moved++;
          }
        }
      }
      await prisma.studentEnrollment.upsert({
        where: { studentId_groupId: { studentId: student.id, groupId } },
        create: { studentId: student.id, groupId, enrollmentType: type, ...(recs[i].startDate ? { enrolledAt: recs[i].startDate } : {}) },
        update: { enrollmentType: type },
      });
    }
  }

  return { dryRun: false, counts, professors: profNames, result: { created, updated, moved }, warnings };
}

module.exports = { importFromBuffer, parseRecords };
