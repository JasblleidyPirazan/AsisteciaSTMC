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
        byPayee[id] = { payeeId: id, payeeType: r.payeeType, name, period, total: 0, records: [] };
      }
      byPayee[id].total += parseFloat(r.total);
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
        summary[key] = { payeeId: id, payeeType: r.payeeType, name, total: 0, classCount: 0 };
      }
      summary[key].total += parseFloat(r.total);
      summary[key].classCount++;
    }

    // Sort: professors first, then assistants
    const sorted = Object.values(summary).sort((a, b) => {
      if (a.payeeType !== b.payeeType) return a.payeeType === 'PROFESSOR' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const totalProfessors = sorted
      .filter((s) => s.payeeType === 'PROFESSOR')
      .reduce((sum, s) => sum + s.total, 0);
    const totalAssistants = sorted
      .filter((s) => s.payeeType === 'ASSISTANT')
      .reduce((sum, s) => sum + s.total, 0);

    res.json({
      success: true,
      data: {
        items: sorted,
        totalProfessors,
        totalAssistants,
        grandTotal: totalProfessors + totalAssistants,
      },
    });
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

    for (const r of records) {
      const name = r.professor?.name || r.assistant?.name || '';
      // r.session.date is a Date at UTC midnight; format in UTC to avoid day shift
      const date = new Date(r.session.date).toLocaleDateString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
      });
      const row = {
        Nombre: name,
        Fecha: date,
        Grupo: r.session.group?.code || '',
        'Estudiantes presentes': r.presentCount,
        'Unidades efectivas': parseFloat(r.effectiveUnits),
        'Tarifa (COP)': parseFloat(r.rate),
        'Total (COP)': parseFloat(r.total),
      };
      if (r.payeeType === 'PROFESSOR') profRows.push(row);
      else asstRows.push(row);
    }

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
            Object.keys(myRows[0]),
            ...myRows.map(Object.values),
            [],
            ['', '', '', '', '', 'TOTAL', myRows.reduce((s, r) => s + r['Total (COP)'], 0)],
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
          Object.keys(profRows[0]),
          ...profRows.map(Object.values),
          [],
          ['', '', '', '', '', 'TOTAL PROFESORES', profRows.reduce((s, r) => s + r['Total (COP)'], 0)],
        ])
      : XLSX.utils.aoa_to_sheet([['Sin registros de profesores para este período']]);
    XLSX.utils.book_append_sheet(wb, wsProf, 'Profesores');

    // Assistants sheet
    const wsAsst = asstRows.length > 0
      ? XLSX.utils.aoa_to_sheet([
          ['LIQUIDACIÓN DE ASISTENTES'],
          [`Período: ${period}`],
          [],
          Object.keys(asstRows[0]),
          ...asstRows.map(Object.values),
          [],
          ['', '', '', '', '', 'TOTAL ASISTENTES', asstRows.reduce((s, r) => s + r['Total (COP)'], 0)],
        ])
      : XLSX.utils.aoa_to_sheet([['Sin registros de asistentes para este período']]);
    XLSX.utils.book_append_sheet(wb, wsAsst, 'Asistentes');

    // Summary sheet
    const grandTotal = [...profRows, ...asstRows].reduce((s, r) => s + r['Total (COP)'], 0);
    const wsSum = XLSX.utils.aoa_to_sheet([
      ['RESUMEN LIQUIDACIÓN'],
      [`Período: ${period}`],
      [],
      ['Concepto', 'Total (COP)'],
      ['Total Profesores', profRows.reduce((s, r) => s + r['Total (COP)'], 0)],
      ['Total Asistentes', asstRows.reduce((s, r) => s + r['Total (COP)'], 0)],
      [],
      ['GRAN TOTAL', grandTotal],
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
