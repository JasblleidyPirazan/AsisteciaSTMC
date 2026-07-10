const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

// Línea de tiempo de auditoría: unifica ediciones de reportes, cambios de grupo
// y aprobaciones de nómina. Solo lectura.
router.get('/', requirePermission('auditoria', 'view'), async (req, res, next) => {
  try {
    const [edits, groupHist, approvals] = await Promise.all([
      prisma.sessionEditLog.findMany({
        take: 60, orderBy: { editedAt: 'desc' },
        include: { editedBy: { select: { email: true } }, session: { select: { date: true, group: { select: { code: true } } } } },
      }),
      prisma.studentGroupHistory.findMany({
        take: 60, orderBy: { changedAt: 'desc' },
        include: { student: { select: { name: true } }, fromGroup: { select: { code: true } }, toGroup: { select: { code: true } } },
      }),
      prisma.payrollApproval.findMany({ take: 30, orderBy: { approvedAt: 'desc' } }),
    ]);

    // changedById no es relación: resolvemos emails en lote.
    const ids = [...new Set(groupHist.map((h) => h.changedById).filter(Boolean))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }) : [];
    const emailById = Object.fromEntries(users.map((u) => [u.id, u.email]));

    const ACTION = { TRANSFER: 'Transferencia', ADD_GROUP: 'Agregado a grupo', REMOVE_GROUP: 'Quitado de grupo' };

    const items = [
      ...edits.map((e) => ({
        type: 'Edición de reporte', icon: '✏️', at: e.editedAt, actor: e.editedBy?.email || '—',
        detail: `${e.session?.group?.code || 'Sesión'} · ${e.session?.date ? new Date(e.session.date).toLocaleDateString('es-CO', { timeZone: 'UTC' }) : ''}`,
      })),
      ...groupHist.map((h) => ({
        type: 'Cambio de grupo', icon: '🔀', at: h.changedAt, actor: emailById[h.changedById] || '—',
        detail: `${h.student?.name || '—'}: ${ACTION[h.actionType] || h.actionType} ${[h.fromGroup?.code, h.toGroup?.code].filter(Boolean).join(' → ')}`.trim(),
      })),
      ...approvals.map((a) => ({
        type: 'Aprobación de nómina', icon: '💰', at: a.approvedAt, actor: a.approvedByName || '—',
        detail: `Período ${a.period}`,
      })),
    ].sort((x, y) => new Date(y.at) - new Date(x.at));

    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
