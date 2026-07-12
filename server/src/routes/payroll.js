const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const { getNextPeriod } = require('../services/costEngine');
const XLSX = require('xlsx');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    if (['PHYSICAL_TRAINER', 'RECEPTION'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
    }

    const { period, payeeId } = req.query;
    if (!period) {
      return res.status(400).json({ success: false, error: 'period requerido (ej: 2025-06-1)' });
    }

    const where = { period };

    if (req.user.role === 'TEACHER') {
      const professor = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      if (!professor) return res.json({ success: true, data: [] });
      where.professorId = professor.id;
      where.payeeType = 'PROFESSOR';
    } else if (req.user.role === 'ASSISTANT') {
      const assistant = await prisma.assistant.findUnique({ where: { userId: req.user.id } });
      if (!assistant) return res.json({ success: true, data: [] });
      where.assistantId = assistant.id;
      where.payeeType = 'ASSISTANT';
    } else if (payeeId) {
      where.OR = [{ professorId: payeeId }, { assistantId: payeeId }];
    }

    const records = await prisma.costRecord.findMany({
      where,
      include: {
        session: { include: { group: { select: { id: true, code: true, name: true } } } },
        professor: { select: { id: true, name: true } },
        assistant: { select: { id: true, name: true } },
      },
      orderBy: { session: { date: 'asc' } },
    });

    const byPayee = {};
    for (const r of records) {
      const id = r.professorId || r.assistantId;
      const name = r.professor?.name || r.assistant?.name;
      if (!byPayee[id]) {
        byPayee[id] = {
          payeeId: id, payeeType: r.payeeType, name, period,
          total: 0, payableTotal: 0, suspendedTotal: 0, pendingTotal: 0,
          records: [],
        };
      }
      const amount = parseFloat(r.total);
      byPayee[id].total += amount;
      if (r.payStatus === 'SUSPENDED_LATE') byPayee[id].suspendedTotal += amount;
      else if (r.payStatus === 'PENDING_MATCH') byPayee[id].pendingTotal += amount;
      else byPayee[id].payableTotal += amount;
      byPayee[id].records.push(r);
    }

    res.json({ success: true, data: Object.values(byPayee) });
  } catch (err) {
    next(err);
  }
});

// Acumulado del semestre para el propio profesor/asistente. Suma sus CostRecords
// cuya sesión cae dentro del semestre activo (por fecha de clase, no por período,
// para que un arrastre no descuadre la atribución), separando pagado / pendiente
// habilitado / retenido. Solo el interesado ve sus cifras.
router.get('/my-semester', async (req, res, next) => {
  try {
    if (!['TEACHER', 'ASSISTANT'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Acceso no autorizado' });
    }

    const where = {};
    if (req.user.role === 'TEACHER') {
      const professor = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      if (!professor) return res.json({ success: true, data: null });
      where.professorId = professor.id;
      where.payeeType = 'PROFESSOR';
    } else {
      const assistant = await prisma.assistant.findUnique({ where: { userId: req.user.id } });
      if (!assistant) return res.json({ success: true, data: null });
      where.assistantId = assistant.id;
      where.payeeType = 'ASSISTANT';
    }

    const semester = await prisma.semester.findFirst({ where: { active: true } });
    if (semester) {
      where.session = { date: { gte: semester.startDate, lte: semester.endDate } };
    }

    const records = await prisma.costRecord.findMany({
      where,
      select: { total: true, payStatus: true, paidAt: true },
    });

    const acc = { paidTotal: 0, pendingPayableTotal: 0, retainedTotal: 0, classCount: records.length };
    for (const r of records) {
      const amount = parseFloat(r.total);
      if (r.payStatus === 'SUSPENDED_LATE' || r.payStatus === 'PENDING_MATCH') acc.retainedTotal += amount;
      else if (r.paidAt) acc.paidTotal += amount;
      else acc.pendingPayableTotal += amount;
    }

    res.json({
      success: true,
      data: { ...acc, semesterName: semester?.name || null, startDate: semester?.startDate || null },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/summary', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { period } = req.query;
    if (!period) return res.status(400).json({ success: false, error: 'period requerido' });

    const records = await prisma.costRecord.findMany({
      where: { period },
      include: {
        professor: { select: { id: true, name: true } },
        assistant: { select: { id: true, name: true } },
      },
    });

    const summary = {};
    for (const r of records) {
      const id = r.professorId || r.assistantId;
      const name = r.professor?.name || r.assistant?.name;
      const key = `${r.payeeType}-${id}`;
      if (!summary[key]) {
        summary[key] = {
          payeeId: id, payeeType: r.payeeType, name,
          total: 0, payableTotal: 0, suspendedTotal: 0, pendingTotal: 0, classCount: 0,
        };
      }
      const amount = parseFloat(r.total);
      summary[key].total += amount;
      if (r.payStatus === 'SUSPENDED_LATE') summary[key].suspendedTotal += amount;
      else if (r.payStatus === 'PENDING_MATCH') summary[key].pendingTotal += amount;
      else summary[key].payableTotal += amount;
      summary[key].classCount++;
    }

    // Sort: professors first, then assistants
    const sorted = Object.values(summary).sort((a, b) => {
      if (a.payeeType !== b.payeeType) return a.payeeType === 'PROFESSOR' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Headline totals count only PAYABLE amounts; retained money is separate
    const totalProfessors = sorted
      .filter((s) => s.payeeType === 'PROFESSOR')
      .reduce((sum, s) => sum + s.payableTotal, 0);
    const totalAssistants = sorted
      .filter((s) => s.payeeType === 'ASSISTANT')
      .reduce((sum, s) => sum + s.payableTotal, 0);
    const suspendedGrandTotal = sorted.reduce((sum, s) => sum + s.suspendedTotal, 0);
    const pendingGrandTotal = sorted.reduce((sum, s) => sum + s.pendingTotal, 0);

    const approval = await prisma.payrollApproval.findUnique({ where: { period } });

    res.json({
      success: true,
      data: {
        items: sorted,
        totalProfessors,
        totalAssistants,
        grandTotal: totalProfessors + totalAssistants,
        suspendedGrandTotal,
        pendingGrandTotal,
        approval: approval
          ? {
              approvedByName: approval.approvedByName,
              approvedAt: approval.approvedAt,
              note: approval.note,
              totalPayable: parseFloat(approval.totalPayable),
              totalRetained: parseFloat(approval.totalRetained),
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Aprobar la liquidación de una quincena. Guarda auditoría (quién/cuándo) y una
// foto de los totales al momento de aprobar. Idempotente por período (upsert).
router.post('/approve', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { period, note } = req.body;
    if (!period) return res.status(400).json({ success: false, error: 'period requerido' });

    const records = await prisma.costRecord.findMany({ where: { period } });
    if (records.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay registros de pago para aprobar en este período' });
    }

    let totalPayable = 0;
    let totalRetained = 0;
    for (const r of records) {
      const amount = parseFloat(r.total);
      if (r.payStatus === 'PAYABLE' || !r.payStatus) totalPayable += amount;
      else totalRetained += amount;
    }

    const approvedByName = req.user.email;
    const approval = await prisma.payrollApproval.upsert({
      where: { period },
      create: {
        period,
        approvedById: req.user.id,
        approvedByName,
        totalPayable,
        totalRetained,
        note: note?.trim() || null,
      },
      update: {
        approvedById: req.user.id,
        approvedByName,
        totalPayable,
        totalRetained,
        note: note?.trim() || null,
        approvedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        approvedByName: approval.approvedByName,
        approvedAt: approval.approvedAt,
        note: approval.note,
        totalPayable: parseFloat(approval.totalPayable),
        totalRetained: parseFloat(approval.totalRetained),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Revertir la aprobación de una quincena (p. ej. si hubo que ajustar registros).
router.delete('/approve', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { period } = req.query;
    if (!period) return res.status(400).json({ success: false, error: 'period requerido' });
    await prisma.payrollApproval.deleteMany({ where: { period } });
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

router.get('/export', requireRole('ADMIN', 'TEACHER', 'ASSISTANT'), async (req, res, next) => {
  try {
    const { period } = req.query;
    if (!period) return res.status(400).json({ success: false, error: 'period requerido' });

    // Teachers and assistants can only export their own biweekly report
    const where = { period };
    if (req.user.role === 'TEACHER') {
      const professor = await prisma.professor.findUnique({ where: { userId: req.user.id } });
      if (!professor) return res.status(404).json({ success: false, error: 'Perfil de profesor no encontrado' });
      where.professorId = professor.id;
      where.payeeType = 'PROFESSOR';
    } else if (req.user.role === 'ASSISTANT') {
      const assistant = await prisma.assistant.findUnique({ where: { userId: req.user.id } });
      if (!assistant) return res.status(404).json({ success: false, error: 'Perfil de asistente no encontrado' });
      where.assistantId = assistant.id;
      where.payeeType = 'ASSISTANT';
    }

    const records = await prisma.costRecord.findMany({
      where,
      include: {
        session: { include: { group: { select: { code: true } } } },
        professor: { select: { name: true } },
        assistant: { select: { name: true } },
      },
      orderBy: [{ payeeType: 'asc' }, { session: { date: 'asc' } }],
    });

    // Build row data for professors
    const profRows = [];
    const asstRows = [];

    const PAY_STATUS_LABEL = {
      PAYABLE: 'Habilitado',
      SUSPENDED_LATE: 'Suspendido (reporte tardío)',
      PENDING_MATCH: 'Pendiente validación',
    };

    for (const r of records) {
      const name = r.professor?.name || r.assistant?.name || '';
      // r.session.date is a Date at UTC midnight; format in UTC to avoid day shift
      const date = new Date(r.session.date).toLocaleDateString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
      });
      const row = {
        Nombre: name,
        Fecha: date,
        Grupo: r.session.group?.code || r.session.title || '',
        'Estudiantes presentes': r.presentCount,
        'Unidades efectivas': parseFloat(r.effectiveUnits),
        'Tarifa (COP)': parseFloat(r.rate),
        'Total (COP)': parseFloat(r.total),
        Estado: PAY_STATUS_LABEL[r.payStatus] || 'Habilitado',
        __payable: r.payStatus === 'PAYABLE' || !r.payStatus,
      };
      if (r.payeeType === 'PROFESSOR') profRows.push(row);
      else asstRows.push(row);
    }

    // Column order for sheets (excludes the internal __payable flag)
    const COLUMNS = ['Nombre', 'Fecha', 'Grupo', 'Estudiantes presentes',
      'Unidades efectivas', 'Tarifa (COP)', 'Total (COP)', 'Estado'];
    const toValues = (row) => COLUMNS.map((c) => row[c]);
    const payableSum = (rows) => rows.filter((r) => r.__payable).reduce((s, r) => s + r['Total (COP)'], 0);
    const retainedSum = (rows) => rows.filter((r) => !r.__payable).reduce((s, r) => s + r['Total (COP)'], 0);

    const wb = XLSX.utils.book_new();

    // Teachers/assistants get a single personal sheet; ADMIN/SUPERADMIN get the full export
    if (!['ADMIN', 'SUPERADMIN'].includes(req.user.role)) {
      const myRows = req.user.role === 'TEACHER' ? profRows : asstRows;
      const title = req.user.role === 'TEACHER' ? 'MI LIQUIDACIÓN — PROFESOR' : 'MI LIQUIDACIÓN — ASISTENTE';
      const wsMine = myRows.length > 0
        ? XLSX.utils.aoa_to_sheet([
            [title],
            [`Período: ${period}`],
            [],
            COLUMNS,
            ...myRows.map(toValues),
            [],
            ['', '', '', '', '', 'TOTAL HABILITADO', payableSum(myRows)],
            ['', '', '', '', '', 'TOTAL RETENIDO', retainedSum(myRows)],
          ])
        : XLSX.utils.aoa_to_sheet([['Sin registros para este período']]);
      XLSX.utils.book_append_sheet(wb, wsMine, 'Mi liquidación');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="mi-liquidacion-${period}.xlsx"`);
      return res.send(buffer);
    }

    // Professors sheet
    const wsProf = profRows.length > 0
      ? XLSX.utils.aoa_to_sheet([
          ['LIQUIDACIÓN DE PROFESORES'],
          [`Período: ${period}`],
          [],
          COLUMNS,
          ...profRows.map(toValues),
          [],
          ['', '', '', '', '', 'TOTAL PROFESORES (HABILITADO)', payableSum(profRows)],
          ['', '', '', '', '', 'TOTAL RETENIDO', retainedSum(profRows)],
        ])
      : XLSX.utils.aoa_to_sheet([['Sin registros de profesores para este período']]);
    XLSX.utils.book_append_sheet(wb, wsProf, 'Profesores');

    // Assistants sheet
    const wsAsst = asstRows.length > 0
      ? XLSX.utils.aoa_to_sheet([
          ['LIQUIDACIÓN DE ASISTENTES'],
          [`Período: ${period}`],
          [],
          COLUMNS,
          ...asstRows.map(toValues),
          [],
          ['', '', '', '', '', 'TOTAL ASISTENTES (HABILITADO)', payableSum(asstRows)],
          ['', '', '', '', '', 'TOTAL RETENIDO', retainedSum(asstRows)],
        ])
      : XLSX.utils.aoa_to_sheet([['Sin registros de asistentes para este período']]);
    XLSX.utils.book_append_sheet(wb, wsAsst, 'Asistentes');

    // Summary sheet — grand total counts only pay-enabled records
    const grandTotal = payableSum(profRows) + payableSum(asstRows);
    const retainedTotal = retainedSum(profRows) + retainedSum(asstRows);
    const wsSum = XLSX.utils.aoa_to_sheet([
      ['RESUMEN LIQUIDACIÓN'],
      [`Período: ${period}`],
      [],
      ['Concepto', 'Total (COP)'],
      ['Total Profesores (habilitado)', payableSum(profRows)],
      ['Total Asistentes (habilitado)', payableSum(asstRows)],
      ['Total retenido (suspendido/pendiente)', retainedTotal],
      [],
      ['GRAN TOTAL A PAGAR', grandTotal],
    ]);
    XLSX.utils.book_append_sheet(wb, wsSum, 'Resumen');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="liquidacion-${period}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ===== Fase 3: pago realizado, cierre de quincena y arrastre =====

// Estado de cierre de una quincena (para la UI).
router.get('/closure', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { period } = req.query;
    if (!period) return res.status(400).json({ success: false, error: 'period requerido' });
    const closure = await prisma.payrollClosure.findUnique({
      where: { period },
      include: { lines: true },
    });
    res.json({ success: true, data: closure });
  } catch (err) {
    next(err);
  }
});

// "Pago realizado": el ADMIN marca (o desmarca) que un costo se pagó. Solo sobre
// registros PAYABLE y en quincenas no cerradas.
router.patch('/records/:id/paid', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const paid = req.body.paid !== false;
    const record = await prisma.costRecord.findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ success: false, error: 'Registro no encontrado' });

    const closure = await prisma.payrollClosure.findUnique({ where: { period: record.period } });
    if (closure?.locked) {
      return res.status(409).json({ success: false, error: 'La quincena está cerrada. Reábrela para editar pagos.' });
    }
    if (paid && record.payStatus !== 'PAYABLE') {
      return res.status(400).json({ success: false, error: 'Solo se puede marcar pagado un registro habilitado (PAYABLE)' });
    }

    const updated = await prisma.costRecord.update({
      where: { id: req.params.id },
      data: paid
        ? { paidAt: new Date(), paidById: req.user.id }
        : { paidAt: null, paidById: null },
    });
    await prisma.payrollLog.create({
      data: {
        period: record.period,
        action: paid ? 'MARK_PAID' : 'UNMARK_PAID',
        actorId: req.user.id,
        actorName: req.user.email,
        detail: { costRecordId: record.id, total: parseFloat(record.total), payeeType: record.payeeType },
      },
    });
    res.json({ success: true, data: { id: updated.id, paidAt: updated.paidAt } });
  } catch (err) {
    next(err);
  }
});

// Cerrar la quincena: congela la liquidación. Requiere que no queden pagos
// PENDING_MATCH (sin validar). Los suspendidos por reporte tardío (SUSPENDED_LATE)
// se ARRASTRAN a la siguiente quincena (cambian su period). Guarda un snapshot
// por profe/asistente y bloquea la edición de reportes/costos del período.
router.post('/close', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { period, note } = req.body;
    if (!period) return res.status(400).json({ success: false, error: 'period requerido' });

    const existing = await prisma.payrollClosure.findUnique({ where: { period } });
    if (existing?.locked) {
      return res.status(409).json({ success: false, error: 'Esta quincena ya está cerrada' });
    }

    const records = await prisma.costRecord.findMany({
      where: { period },
      include: { professor: { select: { name: true } }, assistant: { select: { name: true } } },
    });
    if (records.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay registros de pago en este período' });
    }
    const pending = records.filter((r) => r.payStatus === 'PENDING_MATCH');
    if (pending.length > 0) {
      return res.status(400).json({
        success: false,
        error: `No se puede cerrar: ${pending.length} pago(s) pendiente(s) de validación. Valídalos o resuélvelos primero.`,
      });
    }

    // Foto por payee: pagado (PAYABLE) vs arrastrado (SUSPENDED_LATE).
    const byPayee = {};
    for (const r of records) {
      const payeeId = r.professorId || r.assistantId;
      const key = `${r.payeeType}-${payeeId}`;
      if (!byPayee[key]) {
        byPayee[key] = {
          payeeType: r.payeeType, payeeId,
          payeeName: r.professor?.name || r.assistant?.name || null,
          classCount: 0, totalPaid: 0, totalCarried: 0,
        };
      }
      const amount = parseFloat(r.total);
      byPayee[key].classCount += 1;
      if (r.payStatus === 'SUSPENDED_LATE') byPayee[key].totalCarried += amount;
      else byPayee[key].totalPaid += amount;
    }

    const nextPeriod = getNextPeriod(period);
    const suspended = records.filter((r) => r.payStatus === 'SUSPENDED_LATE');

    const closure = await prisma.$transaction(async (tx) => {
      const c = await tx.payrollClosure.upsert({
        where: { period },
        create: { period, closedById: req.user.id, closedByName: req.user.email, locked: true },
        update: { closedById: req.user.id, closedByName: req.user.email, closedAt: new Date(), reopenedAt: null, reopenedById: null, locked: true },
      });
      await tx.payrollClosureLine.deleteMany({ where: { closureId: c.id } });
      await tx.payrollClosureLine.createMany({
        data: Object.values(byPayee).map((p) => ({
          closureId: c.id,
          payeeType: p.payeeType,
          payeeId: p.payeeId,
          payeeName: p.payeeName,
          classCount: p.classCount,
          totalPaid: p.totalPaid,
          totalCarried: p.totalCarried,
          snapshot: p,
        })),
      });
      // Arrastrar suspendidos a la siguiente quincena.
      if (suspended.length > 0) {
        await tx.costRecord.updateMany({
          where: { id: { in: suspended.map((r) => r.id) } },
          data: { period: nextPeriod, carriedFromPeriod: period },
        });
      }
      await tx.payrollLog.create({
        data: {
          period, action: 'CLOSE', actorId: req.user.id, actorName: req.user.email,
          detail: { note: note?.trim() || null, carried: suspended.length, nextPeriod, payees: Object.keys(byPayee).length },
        },
      });
      if (suspended.length > 0) {
        await tx.payrollLog.create({
          data: { period, action: 'CARRY_OVER', actorId: req.user.id, actorName: req.user.email,
            detail: { count: suspended.length, toPeriod: nextPeriod } },
        });
      }
      return c;
    });

    res.json({ success: true, data: { period, locked: true, carried: suspended.length, nextPeriod, closedAt: closure.closedAt } });
  } catch (err) {
    next(err);
  }
});

// Reabrir una quincena cerrada (solo ADMIN). Desbloquea la edición; no revierte
// los arrastres ya hechos (quedan registrados en el log).
router.post('/reopen', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { period } = req.body;
    if (!period) return res.status(400).json({ success: false, error: 'period requerido' });
    const closure = await prisma.payrollClosure.findUnique({ where: { period } });
    if (!closure || !closure.locked) {
      return res.status(400).json({ success: false, error: 'La quincena no está cerrada' });
    }
    await prisma.payrollClosure.update({
      where: { period },
      data: { locked: false, reopenedById: req.user.id, reopenedAt: new Date() },
    });
    await prisma.payrollLog.create({
      data: { period, action: 'REOPEN', actorId: req.user.id, actorName: req.user.email },
    });
    res.json({ success: true, data: { period, locked: false } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
