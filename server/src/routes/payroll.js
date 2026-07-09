const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
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

    // Teachers/assistants get a single personal sheet
    if (req.user.role !== 'ADMIN') {
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

module.exports = router;
