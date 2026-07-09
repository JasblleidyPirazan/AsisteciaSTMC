/**
 * Importador de matrícula desde el Excel de preinscripción.
 *
 * Uso:
 *   node src/scripts/importEnrollment.js [ruta.xlsx] [--dry-run]
 *
 * Si no se pasa ruta, usa server/data/matricula.xlsx. La idea es que reemplaces
 * ese archivo y vuelvas a correr el script: hace UPSERT (actualiza lo existente,
 * agrega lo nuevo) y NO borra estudiantes que ya no estén en el archivo.
 *
 * Fuente de datos: hoja "Consolidado Matrícula".
 *   Columnas: ID, NOMBRE COMPLETO, CÓDIGO GRUPO, NIVEL, PROFESOR, HORARIO, DÍAS,
 *   EDAD, Documento, Fecha de nacimiento, Número de WA, Acudiente,
 *   Correo electrónico, Fecha de inicio, Clases canceladas, Estado de pago, ...
 *
 * Reglas de mapeo:
 *   - Profesor: se crea/reutiliza por nombre.
 *   - Grupo: se crea/reutiliza por CÓDIGO. Días desde "DÍAS", horario desde
 *     "HORARIO", nivel/subnivel desde "NIVEL".
 *   - Estudiante: upsert por Documento (o por nombre si no hay documento).
 *     paymentComplete = ("Estado de pago" > 0). classesAcquired NO se toca en
 *     actualizaciones (se respeta lo que edites en la app); en creación queda 0.
 *   - Matrícula: la primera fila del estudiante = grupo PRIMARY; filas
 *     adicionales del mismo estudiante = grupos SECONDARY.
 */
const path = require('path');
const XLSX = require('xlsx');
const prisma = require('../lib/prisma');

const DRY = process.argv.includes('--dry-run');
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const FILE = path.resolve(fileArg || path.join(__dirname, '../../data/matricula.xlsx'));

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

// Tokens de día vistos en el archivo: "L,M" (Lun-Mié), "Ma,J" (Mar-Jue), "V", "Sab"
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

// ---------- lectura del Excel ----------

function readRows() {
  const wb = XLSX.readFile(FILE);
  const sheetName = wb.SheetNames.find((n) => /consolidado/i.test(n));
  if (!sheetName) throw new Error('No se encontró la hoja "Consolidado Matrícula" en ' + FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  const hIdx = rows.findIndex((r) => r.includes('NOMBRE COMPLETO'));
  if (hIdx < 0) throw new Error('No se encontró la fila de encabezados (NOMBRE COMPLETO)');
  const header = rows[hIdx];
  const col = (name) => header.indexOf(name);
  const idx = {
    name: col('NOMBRE COMPLETO'), code: col('CÓDIGO GRUPO'), level: col('NIVEL'),
    prof: col('PROFESOR'), horario: col('HORARIO'), dias: col('DÍAS'),
    doc: col('Documento'), birth: col('Fecha de nacimiento'), wa: col('Número de WA'),
    guardian: col('Acudiente'), email: col('Correo electrónico'), start: col('Fecha de inicio'),
    pago: col('Estado de pago'),
  };
  const records = rows.slice(hIdx + 1)
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
  return records;
}

// ---------- import ----------

async function run() {
  console.log(`📄 Archivo: ${FILE}`);
  console.log(DRY ? '🔎 MODO DRY-RUN (no escribe en la base de datos)\n' : '💾 Escribiendo en la base de datos\n');

  const records = readRows();
  console.log(`Registros con nombre: ${records.length}`);

  // Agrupar por estudiante (documento, o nombre si no hay documento)
  const byStudent = new Map();
  for (const r of records) {
    const key = r.document || `name:${r.name.toLowerCase()}`;
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(r);
  }

  // Grupos y profesores únicos
  const profNames = [...new Set(records.map((r) => r.professor).filter(Boolean))];
  const groupCodes = [...new Set(records.map((r) => r.code).filter(Boolean))];

  console.log(`Estudiantes únicos: ${byStudent.size}`);
  console.log(`Grupos únicos: ${groupCodes.length}`);
  console.log(`Profesores únicos: ${profNames.length} (${profNames.join(', ')})`);

  if (DRY) {
    console.log('\n--- Muestra de 3 grupos ---');
    groupCodes.slice(0, 3).forEach((code) => {
      const r = records.find((x) => x.code === code);
      const lvl = parseLevel(r.level);
      const days = parseDays(r.dias, code);
      const hr = parseHorario(r.horario);
      console.log(code, '→', JSON.stringify({ ...lvl, ...hr, prof: r.professor, days: Object.keys(days).filter((d) => days[d]) }));
    });
    console.log('\n--- Muestra de 3 estudiantes ---');
    [...byStudent.values()].slice(0, 3).forEach((recs) => {
      const r = recs[0];
      console.log(JSON.stringify({ name: r.name, doc: r.document, email: r.email, wa: r.phone, guardian: r.guardianName,
        birthDate: r.birthDate && r.birthDate.toISOString().slice(0, 10), paymentComplete: r.paymentComplete,
        grupos: recs.map((x) => x.code) }));
    });
    const multi = [...byStudent.values()].filter((r) => r.length > 1).length;
    console.log(`\nEstudiantes con más de un grupo (PRIMARY + SECONDARY): ${multi}`);
    console.log('\n✅ Dry-run completo. Sin cambios en la base.');
    return;
  }

  // 1) Profesores (upsert por nombre)
  const profByName = {};
  for (const name of profNames) {
    let p = await prisma.professor.findFirst({ where: { name } });
    if (!p) p = await prisma.professor.create({ data: { name } });
    profByName[name] = p.id;
  }
  console.log(`\n✔ Profesores: ${profNames.length}`);

  // 2) Grupos (upsert por código)
  const groupByCode = {};
  for (const code of groupCodes) {
    const r = records.find((x) => x.code === code);
    const { ballLevel, subLevel } = parseLevel(r.level);
    const days = parseDays(r.dias, code);
    const { startTime, endTime, durationMinutes } = parseHorario(r.horario);
    const professorId = profByName[r.professor];
    if (!professorId) { console.warn(`  ⚠ Grupo ${code} sin profesor válido (${r.professor}); se omite`); continue; }
    const data = {
      professorId, ...days, startTime, endTime, durationMinutes,
      classUnits: 1.0, ballLevel, subLevel,
      name: [ballLevel, subLevel].filter(Boolean).join(' ') || null,
    };
    const g = await prisma.group.upsert({ where: { code }, create: { code, ...data }, update: data });
    groupByCode[code] = g.id;
  }
  console.log(`✔ Grupos: ${Object.keys(groupByCode).length}`);

  // 3) Estudiantes + matrículas
  let created = 0, updated = 0, moved = 0;
  for (const recs of byStudent.values()) {
    const r0 = recs[0];
    // Buscar existente por documento o por nombre
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

    // Matrículas: primera = PRIMARY, resto = SECONDARY
    const existing = await prisma.studentEnrollment.findMany({ where: { studentId: student.id } });
    for (let i = 0; i < recs.length; i++) {
      const code = recs[i].code;
      const groupId = code ? groupByCode[code] : null;
      if (!groupId) continue;
      const type = i === 0 ? 'PRIMARY' : 'SECONDARY';

      // Si es PRIMARY y ya tiene un PRIMARY en otro grupo, se corrige (se mueve)
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

  console.log(`✔ Estudiantes: ${created} creados, ${updated} actualizados, ${moved} cambios de grupo principal`);
  console.log('\n✅ Importación completa.');
}

run()
  .catch((err) => { console.error('❌ Error:', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
