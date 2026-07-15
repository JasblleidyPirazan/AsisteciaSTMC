const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { byGroupCode } = require('../lib/sort');

const router = express.Router();

// Búsqueda global (buscador ⌘K): estudiantes y grupos activos que coincidan con
// el texto. Solo roles de gestión con acceso a esas vistas. Devuelve lo mínimo
// para pintar cada resultado y navegar a su detalle.
router.get('/', requireRole('ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER', 'RECEPTION'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, data: { students: [], groups: [] } });

    const [students, groups] = await Promise.all([
      prisma.student.findMany({
        where: {
          active: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { document: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, name: true, document: true, isTrial: true,
          enrollments: { select: { enrollmentType: true, group: { select: { code: true } } } },
        },
        take: 8,
        orderBy: { name: 'asc' },
      }),
      prisma.group.findMany({
        where: {
          active: true,
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { ballLevel: { contains: q, mode: 'insensitive' } },
            { professor: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
        select: { id: true, code: true, ballLevel: true, subLevel: true, professor: { select: { name: true } } },
        take: 8,
      }),
    ]);

    const studentRows = students.map((s) => {
      const primary = s.enrollments.find((e) => e.enrollmentType === 'PRIMARY') || s.enrollments[0];
      return { id: s.id, name: s.name, document: s.document, isTrial: s.isTrial, groupCode: primary?.group?.code || null };
    });
    groups.sort(byGroupCode);

    res.json({ success: true, data: { students: studentRows, groups } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
