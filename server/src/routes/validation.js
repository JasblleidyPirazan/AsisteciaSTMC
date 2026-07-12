// Validación de datos + aceptación de políticas (flujo público).
// El acudiente/estudiante entra con el DOCUMENTO del estudiante, ve sus datos
// (y los de sus hermanos: mismo acudiente o teléfono), corrige el contacto y
// acepta las políticas. La Escuela lleva el control de quién completó el proceso.
const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Límite para los endpoints públicos (evita barridos de documentos).
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes, intenta más tarde' },
});

// Solo los campos que el acudiente puede ver/editar. Nombre y documento van de
// solo-lectura; nunca exponemos datos económicos ni de asistencia.
function publicView(s) {
  return {
    id: s.id,
    name: s.name,
    document: s.document,
    email: s.email || '',
    phone: s.phone || '',
    guardianName: s.guardianName || '',
    birthDate: s.birthDate ? new Date(s.birthDate).toISOString().slice(0, 10) : '',
    groups: (s.enrollments || []).map((e) => e.group?.code).filter(Boolean),
    validatedAt: s.validatedAt,
  };
}

// Deriva la "familia" a partir del documento de un estudiante: él mismo + los
// activos que comparten acudiente o teléfono (hermanos).
async function findFamily(document) {
  const doc = String(document || '').trim();
  if (!doc) return [];
  const self = await prisma.student.findFirst({ where: { document: doc, active: true } });
  if (!self) return [];
  const or = [{ id: self.id }];
  if (self.phone) or.push({ phone: self.phone });
  if (self.guardianName) or.push({ guardianName: self.guardianName });
  return prisma.student.findMany({
    where: { active: true, OR: or },
    include: { enrollments: { include: { group: { select: { code: true } } } } },
    orderBy: { name: 'asc' },
  });
}

// Buscar los estudiantes asociados a un documento.
router.post('/lookup', publicLimiter, async (req, res, next) => {
  try {
    const family = await findFamily(req.body?.document);
    if (family.length === 0) {
      return res.json({ success: true, data: { found: false, students: [] } });
    }
    res.json({ success: true, data: { found: true, students: family.map(publicView) } });
  } catch (err) {
    next(err);
  }
});

// Guardar correcciones + aceptación de políticas. La familia se re-deriva del
// documento en el servidor; solo se actualizan estudiantes de esa familia.
router.post('/submit', publicLimiter, async (req, res, next) => {
  try {
    const { document, students, policiesAccepted } = req.body || {};
    if (!policiesAccepted) {
      return res.status(400).json({ success: false, error: 'Debes aceptar las políticas para continuar' });
    }
    const family = await findFamily(document);
    if (family.length === 0) {
      return res.status(404).json({ success: false, error: 'No se encontraron estudiantes con ese documento' });
    }
    const allowed = new Map(family.map((s) => [s.id, s]));
    const edits = Array.isArray(students) ? students : [];
    const now = new Date();

    let updated = 0;
    for (const e of edits) {
      if (!allowed.has(e.id)) continue; // nunca fuera de la familia
      await prisma.student.update({
        where: { id: e.id },
        data: {
          email: e.email ? String(e.email).slice(0, 254) : null,
          phone: e.phone ? String(e.phone).slice(0, 40) : null,
          guardianName: e.guardianName ? String(e.guardianName).slice(0, 200) : null,
          birthDate: e.birthDate ? new Date(e.birthDate) : null,
          validatedAt: now,
          policiesAcceptedAt: now,
        },
      });
      updated++;
    }

    // Marcar como validados también a los miembros de la familia que no vinieron
    // en el payload (p. ej. si el acudiente no tocó ese hijo pero aceptó por todos).
    const editedIds = new Set(edits.map((e) => e.id));
    for (const s of family) {
      if (editedIds.has(s.id)) continue;
      await prisma.student.update({
        where: { id: s.id },
        data: { validatedAt: now, policiesAcceptedAt: now },
      });
    }

    res.json({ success: true, data: { updated, family: family.length } });
  } catch (err) {
    next(err);
  }
});

// Control para la Escuela: quién completó la validación (autenticado).
router.get('/status', authMiddleware, requireRole('ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'), async (req, res, next) => {
  try {
    const students = await prisma.student.findMany({
      where: { active: true },
      select: {
        id: true, name: true, document: true, validatedAt: true, policiesAcceptedAt: true,
        enrollments: { include: { group: { select: { code: true } } } },
      },
      orderBy: [{ validatedAt: 'asc' }, { name: 'asc' }],
    });
    const list = students.map((s) => ({
      id: s.id,
      name: s.name,
      document: s.document || '',
      group: s.enrollments.find((e) => e.enrollmentType === 'PRIMARY')?.group?.code
        || s.enrollments[0]?.group?.code || '',
      validatedAt: s.validatedAt,
      policiesAcceptedAt: s.policiesAcceptedAt,
    }));
    const validated = list.filter((s) => s.validatedAt).length;
    res.json({
      success: true,
      data: { total: list.length, validated, pending: list.length - validated, students: list },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
