const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Auditoría: feed unificado y filtrable de las acciones registradas en el
// sistema. Reúne tres bitácoras que ya se escriben en otros flujos:
//  - SESSION_EDIT   → ediciones de reportes de asistencia (SessionEditLog)
//  - GROUP_CHANGE   → cambios de grupo de estudiantes (StudentGroupHistory)
//  - PAYROLL        → cierres/reaperturas/pagos de quincena (PayrollLog)
// No crea una tabla nueva: normaliza lo existente a una forma común y lo ordena
// cronológicamente. Solo ADMIN / SUPERADMIN.

const TYPES = ['SESSION_EDIT', 'GROUP_CHANGE', 'PAYROLL'];

const PAYROLL_ACTION_LABEL = {
  CLOSE: 'Cerró la quincena',
  REOPEN: 'Reabrió la quincena',
  MARK_PAID: 'Marcó como pagado',
  UNMARK_PAID: 'Quitó marca de pagado',
  UNLOCK_LATE: 'Desbloqueó pago suspendido',
  CARRY_OVER: 'Arrastró pago a la siguiente quincena',
};

const GROUP_ACTION_LABEL = {
  TRANSFER: 'Cambió de grupo',
  ADD_GROUP: 'Agregó a un grupo',
  REMOVE_GROUP: 'Quitó de un grupo',
};

function dateRange(from, to) {
  if (!from && !to) return undefined;
  const r = {};
  if (from) r.gte = new Date(from);
  if (to) {
    // incluir todo el día "to"
    const end = new Date(to);
    end.setUTCHours(23, 59, 59, 999);
    r.lte = end;
  }
  return r;
}

router.get('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { type, from, to } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const at = dateRange(from, to);
    const want = (t) => !type || type === t;

    const events = [];

    // 1) Ediciones de reportes de asistencia
    if (want('SESSION_EDIT')) {
      const logs = await prisma.sessionEditLog.findMany({
        where: at ? { editedAt: at } : undefined,
        include: {
          editedBy: { select: { email: true } },
          session: {
            select: {
              id: true, date: true, kind: true, title: true,
              group: { select: { code: true } },
            },
          },
        },
        orderBy: { editedAt: 'desc' },
        take: limit,
      });
      for (const l of logs) {
        const s = l.session;
        const label = s?.group?.code || s?.title
          || (s?.kind === 'MAKEUP' ? 'Reposición' : s?.kind === 'FESTIVAL' ? 'Festival' : 'Clase');
        events.push({
          id: `se-${l.id}`,
          type: 'SESSION_EDIT',
          at: l.editedAt,
          actor: l.editedBy?.email || null,
          title: 'Editó un reporte de asistencia',
          subject: label,
          sessionDate: s?.date || null,
          meta: { sessionId: l.sessionId },
        });
      }
    }

    // 2) Cambios de grupo de estudiantes.
    // StudentGroupHistory guarda changedById pero no tiene relación con User,
    // así que resolvemos los correos de los actores en una consulta aparte.
    if (want('GROUP_CHANGE')) {
      const logs = await prisma.studentGroupHistory.findMany({
        where: at ? { changedAt: at } : undefined,
        include: {
          student: { select: { name: true } },
          fromGroup: { select: { code: true } },
          toGroup: { select: { code: true } },
        },
        orderBy: { changedAt: 'desc' },
        take: limit,
      });
      const actorIds = [...new Set(logs.map((l) => l.changedById).filter(Boolean))];
      const actors = actorIds.length
        ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
        : [];
      const emailById = Object.fromEntries(actors.map((u) => [u.id, u.email]));
      for (const l of logs) {
        const parts = [];
        if (l.fromGroup?.code) parts.push(l.fromGroup.code);
        if (l.toGroup?.code) parts.push(l.toGroup.code);
        events.push({
          id: `gh-${l.id}`,
          type: 'GROUP_CHANGE',
          at: l.changedAt,
          actor: emailById[l.changedById] || null,
          title: GROUP_ACTION_LABEL[l.actionType] || 'Cambio de grupo',
          subject: l.student?.name || 'Estudiante',
          detail: parts.length === 2 ? `${parts[0]} → ${parts[1]}` : parts[0] || null,
          reason: l.reason || null,
          meta: { studentId: l.studentId, actionType: l.actionType },
        });
      }
    }

    // 3) Liquidación (cierres, reaperturas, pagos)
    if (want('PAYROLL')) {
      const logs = await prisma.payrollLog.findMany({
        where: at ? { at } : undefined,
        orderBy: { at: 'desc' },
        take: limit,
      });
      for (const l of logs) {
        events.push({
          id: `pl-${l.id}`,
          type: 'PAYROLL',
          at: l.at,
          actor: l.actorName || null,
          title: PAYROLL_ACTION_LABEL[l.action] || l.action,
          subject: `Quincena ${l.period}`,
          detail: l.detail && typeof l.detail === 'object' && l.detail.count != null
            ? `${l.detail.count} registro${l.detail.count !== 1 ? 's' : ''}` : null,
          meta: { period: l.period, action: l.action },
        });
      }
    }

    // Orden cronológico descendente (más reciente primero) y recorte final.
    events.sort((a, b) => new Date(b.at) - new Date(a.at));
    const sliced = events.slice(0, limit);

    res.json({
      success: true,
      data: {
        events: sliced,
        total: sliced.length,
        truncated: events.length > sliced.length,
        types: TYPES,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
