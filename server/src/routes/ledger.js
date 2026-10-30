// Ledger del paquete de cada estudiante (docs/brief-implementacion.md, §1.5).
//
//   GET /api/ledger              { semester, summary, ledgers }  — filtros groupId, semaforo, q
//   GET /api/ledger/groups       plan, dadas, festivos, lluvia, fin estimado y agregados por grupo
//   GET /api/ledger/:studentId   un ledger
//
// Las cifras salen de services/studentLedger.js (una sola definición); esta
// ruta solo autoriza, filtra y presenta.
const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { professorIdOf } = require('../lib/permissions');
const { compareCodes } = require('../lib/sort');
const { loadLedgers, summarizeLedgers } = require('../services/studentLedger');
const { holidayDeviationForGroup, loadGroupSessionCounts, getPlanClasses } = require('../services/semesterProgress');

const router = express.Router();

const SEMAFOROS = ['VERDE', 'AMBAR', 'ROJO', 'GRIS'];
// Roles que ven el monto de matrícula dentro del ledger: los mismos que ya lo ven
// en el resto del sistema (services/studentStatus.TUITION_ROLES: ADMIN, SUPERADMIN
// y Recepción, que registra los pagos). Coordinador y Profesor lo reciben sin él.
const { TUITION_ROLES } = require('../services/studentStatus');

// "María  Pérez" → "maria perez"
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function present(ledger, role, { ownChild = false } = {}) {
  if (TUITION_ROLES.includes(role) || ownChild) return ledger;
  const { tuition, ...rest } = ledger; // eslint-disable-line no-unused-vars
  return rest;
}

// Lo que más urge primero: déficit, luego por agendar, luego sin consolidar
const byUrgency = (a, b) =>
  b.pendientes.deficit - a.pendientes.deficit
  || b.reposicion.porAgendar - a.reposicion.porAgendar
  || b.sinConsolidar.clases - a.sinConsolidar.clases
  || a.name.localeCompare(b.name, 'es');

// ─── GET /api/ledger ──────────────────────────────────────────────────────

router.get('/', requireRole('ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'), async (req, res, next) => {
  try {
    const { groupId, semaforo, q } = req.query;
    if (semaforo && !SEMAFOROS.includes(String(semaforo).toUpperCase())) {
      return res.status(400).json({ success: false, error: `semaforo debe ser uno de ${SEMAFOROS.join(', ')}` });
    }

    const loaded = await loadLedgers({ groupIds: groupId ? [String(groupId)] : null });

    // El resumen cubre el conjunto del grupo pedido (no el filtro de semáforo ni la
    // búsqueda): así los contadores por semáforo siguen sumando el total
    const summary = summarizeLedgers(loaded.ledgers);

    let ledgers = loaded.ledgers;
    if (semaforo) ledgers = ledgers.filter((l) => l.semaforo === String(semaforo).toUpperCase());
    if (q && String(q).trim()) {
      const needle = norm(q);
      ledgers = ledgers.filter((l) => norm(l.name).includes(needle) || norm(l.document).includes(needle));
    }
    ledgers = [...ledgers].sort(byUrgency).map((l) => present(l, req.user.role));

    res.json({
      success: true,
      data: { semester: loaded.semester, window: loaded.window, today: loaded.today, summary, ledgers },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/ledger/groups ───────────────────────────────────────────────
// (antes de /:studentId para que "groups" no se tome como un id)

router.get('/groups', requireRole('ADMIN', 'PHYSICAL_TRAINER'), async (req, res, next) => {
  try {
    const loaded = await loadLedgers();
    if (!loaded.semester) return res.json({ success: true, data: { semester: null, groups: [] } });

    const { semester, window, today, exclusions } = loaded;
    const groups = await prisma.group.findMany({
      where: { active: true },
      include: { professor: { select: { id: true, name: true } } },
    });
    const [plan, counts] = await Promise.all([
      getPlanClasses(),
      loadGroupSessionCounts(groups, semester, today, window),
    ]);

    const rows = groups.map((g) => {
      const cal = holidayDeviationForGroup(g, semester, exclusions, {
        plan, todayStr: today,
        given: counts.given[g.id] || 0, rain: counts.rain[g.id] || 0, givenToday: !!counts.givenToday[g.id],
      });
      // Estudiantes del grupo (un estudiante en dos grupos cuenta en ambos)
      const mine = loaded.ledgers.filter((l) => l.groups.some((x) => x.id === g.id));
      const inScope = mine.filter((l) => l.paquete.total > 0 && !['INACTIVO', 'PRUEBA'].includes(l.status));
      const sum = (fn) => Math.round(inScope.reduce((acc, l) => acc + fn(l), 0) * 10) / 10;
      return {
        groupId: g.id,
        code: g.code,
        ballLevel: g.ballLevel,
        subLevel: g.subLevel,
        days: cal.days,
        professor: g.professor,
        plan: cal.plan,
        dadas: cal.given,
        porDar: cal.remaining,
        festivos: cal.lost,
        festivosFechas: cal.lostDates,
        lluvia: cal.rain,
        inicioPlan: cal.plannedStart,
        finPlaneado: cal.plannedEnd,
        finEstimado: cal.estimatedEnd,
        retrasoDias: cal.delayDays,
        students: {
          total: mine.length,
          conPaquete: inScope.length,
          deficit: sum((l) => l.pendientes.deficit),
          conDeficit: inScope.filter((l) => l.pendientes.deficit > 0).length,
          porAgendar: sum((l) => l.reposicion.porAgendar),
          sinConsolidar: inScope.reduce((acc, l) => acc + l.sinConsolidar.clases, 0),
          semaforo: Object.fromEntries(SEMAFOROS.map((s) => [s, inScope.filter((l) => l.semaforo === s).length])),
        },
      };
    });
    rows.sort((a, b) => b.students.deficit - a.students.deficit
      || b.students.porAgendar - a.students.porAgendar
      || compareCodes(a.code, b.code));

    res.json({
      success: true,
      data: { semester: loaded.semester, window, today, plan, exclusions, groups: rows },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/ledger/:studentId ───────────────────────────────────────────

router.get('/:studentId', async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    const { studentId } = req.params;
    const FULL = ['ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'];
    if (![...FULL, 'TEACHER', 'PARENT'].includes(role)) {
      return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
    }

    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, parentUserId: true } });
    if (!student) return res.status(404).json({ success: false, error: 'Estudiante no encontrado' });

    let ownChild = false;
    if (role === 'PARENT') {
      // Solo su hijo
      if (student.parentUserId !== userId) return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
      ownChild = true;
    } else if (role === 'TEACHER') {
      // Solo estudiantes de grupos donde es el titular
      const professorId = await professorIdOf(req.user);
      const mine = professorId && await prisma.studentEnrollment.findFirst({
        where: { studentId, group: { professorId } },
      });
      if (!mine) return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
    }

    const { ledgers } = await loadLedgers({ studentIds: [studentId] });
    // Sin semestre activo no hay paquete que calcular
    res.json({ success: true, data: ledgers[0] ? present(ledgers[0], role, { ownChild }) : null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
