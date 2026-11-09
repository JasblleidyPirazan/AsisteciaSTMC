const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { bogotaDateStr } = require('../lib/dates');
const { validateExtension, validateSemesterDates } = require('../services/semesterExtension');

const router = express.Router();

// Get all semesters
router.get('/', async (req, res, next) => {
  try {
    const semesters = await prisma.semester.findMany({
      include: { exclusions: { orderBy: { date: 'asc' } } },
      orderBy: { startDate: 'desc' },
    });
    res.json({ success: true, data: semesters });
  } catch (err) {
    next(err);
  }
});

// Get current active semester
router.get('/active', async (req, res, next) => {
  try {
    const semester = await prisma.semester.findFirst({
      where: { active: true },
      include: { exclusions: { orderBy: { date: 'asc' } } },
    });
    res.json({ success: true, data: semester });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, startDate, endDate, active } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Nombre, fecha inicio y fecha fin requeridos' });
    }
    if (String(endDate).slice(0, 10) < String(startDate).slice(0, 10)) {
      return res.status(400).json({ success: false, error: 'La fecha de fin debe ser posterior a la de inicio' });
    }

    // If marking as active, deactivate all others first
    if (active) {
      await prisma.semester.updateMany({ data: { active: false } });
    }

    const semester = await prisma.semester.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        active: !!active,
      },
      include: { exclusions: true },
    });
    res.status(201).json({ success: true, data: semester });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { name, startDate, endDate, active } = req.body;
    if (startDate !== undefined || endDate !== undefined) {
      const current = await prisma.semester.findUnique({ where: { id: req.params.id } });
      if (!current) return res.status(404).json({ success: false, error: 'Semestre no encontrado' });
      const all = await prisma.semester.findMany({ select: { id: true, name: true, startDate: true } });
      const check = validateSemesterDates({
        semester: { ...current, startDate: startDate ?? current.startDate, endDate: endDate ?? current.endDate },
        allSemesters: all,
      });
      if (check.error) return res.status(400).json({ success: false, error: check.error });
    }
    const data = {};
    if (name !== undefined) data.name = name;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (active !== undefined) {
      data.active = active;
      if (active) {
        await prisma.semester.updateMany({
          where: { id: { not: req.params.id } },
          data: { active: false },
        });
      }
    }

    const semester = await prisma.semester.update({
      where: { id: req.params.id },
      data,
      include: { exclusions: { orderBy: { date: 'asc' } } },
    });
    res.json({ success: true, data: semester });
  } catch (err) {
    next(err);
  }
});

/**
 * Ampliar el semestre (correr la fecha de fin). Body { endDate, dryRun }.
 * Con dryRun (por defecto) no guarda: devuelve la vista previa con el impacto
 * en el déficit (estudiantes que no alcanzan a ver su paquete antes del cierre),
 * calculado con el mismo ledger que usa todo el sistema.
 */
router.post('/:id/extend', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const semester = await prisma.semester.findUnique({ where: { id: req.params.id }, include: { exclusions: true } });
    if (!semester) return res.status(404).json({ success: false, error: 'Semestre no encontrado' });
    const all = await prisma.semester.findMany({ select: { id: true, name: true, startDate: true } });
    const check = validateExtension({ semester, allSemesters: all, newEnd: req.body?.endDate });
    if (check.error) return res.status(400).json({ success: false, error: check.error });

    const dryRun = req.body?.dryRun !== false;
    let impact = null;
    if (semester.active) {
      // Mismo ledger que el resto del sistema, con la fecha de fin actual y con la nueva
      const { loadLedgers, summarizeLedgers } = require('../services/studentLedger');
      const brief = (s) => ({
        deficit: s.pendientes.deficit,
        studentsWithDeficit: s.pendientes.studentsWithDeficit,
        cubreCalendario: s.pendientes.cubreCalendario,
      });
      const [before, after] = await Promise.all([
        loadLedgers({ semester }),
        loadLedgers({ semester: { ...semester, endDate: new Date(`${check.to}T00:00:00Z`) } }),
      ]);
      impact = { before: brief(summarizeLedgers(before.ledgers)), after: brief(summarizeLedgers(after.ledgers)) };
    }
    // Festivos o recesos ya cargados dentro del período nuevo (para revisar que estén todos)
    const exclusionsInRange = semester.exclusions
      .map((e) => ({ date: e.date.toISOString().slice(0, 10), reason: e.reason || null }))
      .filter((e) => e.date > check.from && e.date <= check.to)
      .sort((a, b) => a.date.localeCompare(b.date));

    const preview = { from: check.from, to: check.to, days: check.days, active: semester.active, impact, exclusionsInRange };
    if (dryRun) return res.json({ success: true, data: { ...preview, applied: false } });

    const updated = await prisma.semester.update({
      where: { id: semester.id },
      data: { endDate: new Date(`${check.to}T00:00:00Z`) },
      include: { exclusions: { orderBy: { date: 'asc' } } },
    });
    console.log(`[semesters] ${req.user.email} amplió "${semester.name}" de ${check.from} a ${check.to} (${bogotaDateStr()})`);
    res.json({ success: true, data: { ...preview, applied: true, semester: updated } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.semesterExclusion.deleteMany({ where: { semesterId: req.params.id } });
    await prisma.semester.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { message: 'Semestre eliminado' } });
  } catch (err) {
    next(err);
  }
});

// Exclusions
router.post('/:id/exclusions', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { date, reason } = req.body;
    if (!date) return res.status(400).json({ success: false, error: 'Fecha requerida' });
    const existing = await prisma.semesterExclusion.findFirst({
      where: { semesterId: req.params.id, date: new Date(date) },
    });
    if (existing) return res.status(409).json({ success: false, error: 'Esa fecha ya está excluida' });

    const exclusion = await prisma.semesterExclusion.create({
      data: { semesterId: req.params.id, date: new Date(date), reason: reason || null },
    });
    res.status(201).json({ success: true, data: exclusion });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/exclusions/:exclusionId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.semesterExclusion.delete({ where: { id: req.params.exclusionId } });
    res.json({ success: true, data: { message: 'Fecha excluida eliminada' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
