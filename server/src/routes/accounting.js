const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const XLSX = require('xlsx');
const {
  periodsBetween,
  monthsBetween,
  summarizeIncome,
  summarizeExpenses,
  buildBalance,
} = require('../services/accounting');

const router = express.Router();

// Módulo 100% económico: solo ADMIN (SUPERADMIN pasa por superset de roles).
router.use(requireRole('ADMIN'));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRange(req, res) {
  const { from, to } = req.query;
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
    res.status(400).json({ success: false, error: 'from y to requeridos (YYYY-MM-DD)' });
    return null;
  }
  if (from > to) {
    res.status(400).json({ success: false, error: 'from debe ser anterior o igual a to' });
    return null;
  }
  return { from, to };
}

// Carga y resume todo el rango en una pasada (alimenta las 3 hojas y el export).
async function loadSummary(from, to) {
  const periods = periodsBetween(from, to);
  const [payments, records, closures] = await Promise.all([
    prisma.studentPayment.findMany({
      where: { paymentDate: { gte: new Date(from), lte: new Date(to) } },
      include: { student: { select: { id: true, name: true, document: true } } },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.costRecord.findMany({
      where: { period: { in: periods } },
      select: { period: true, payeeType: true, payStatus: true, total: true, paidAt: true },
    }),
    prisma.payrollClosure.findMany({ where: { period: { in: periods } } }),
  ]);

  const income = summarizeIncome(payments);
  const expenses = summarizeExpenses(records, closures);
  const balance = buildBalance(monthsBetween(from, to), income.byMonth, expenses.byMonth);

  return { payments, income, expenses, balance };
}

// Resumen completo del módulo: ingresos (con detalle de pagos), gastos por
// quincena y balance mensual, para el rango [from, to].
router.get('/summary', async (req, res, next) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const { payments, income, expenses, balance } = await loadSummary(range.from, range.to);

    res.json({
      success: true,
      data: {
        from: range.from,
        to: range.to,
        income: {
          ...income.totals,
          byMethod: income.byMethod,
          payments: payments.map((p) => ({
            id: p.id,
            paymentDate: p.paymentDate,
            method: p.method,
            amount: parseFloat(p.amount),
            note: p.note,
            receivedByName: p.receivedByName,
            verifiedAt: p.verifiedAt,
            verifiedByName: p.verifiedByName,
            student: p.student,
          })),
        },
        expenses: { rows: expenses.rows, totals: expenses.totals },
        balance,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Marcar/desmarcar un pago de estudiante como VERIFICADO (conciliado contra
// extracto bancario o arqueo de caja). Deja auditoría de quién y cuándo.
router.patch('/payments/:id/verified', async (req, res, next) => {
  try {
    const verified = req.body.verified !== false;
    const payment = await prisma.studentPayment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ success: false, error: 'Pago no encontrado' });

    const updated = await prisma.studentPayment.update({
      where: { id: payment.id },
      data: verified
        ? { verifiedAt: new Date(), verifiedById: req.user.id, verifiedByName: req.user.email }
        : { verifiedAt: null, verifiedById: null, verifiedByName: null },
    });
    res.json({
      success: true,
      data: { id: updated.id, verifiedAt: updated.verifiedAt, verifiedByName: updated.verifiedByName },
    });
  } catch (err) {
    next(err);
  }
});

// Export Excel con las 3 hojas del módulo (Ingresos, Gastos, Balance).
router.get('/export', async (req, res, next) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const { payments, income, expenses, balance } = await loadSummary(range.from, range.to);

    const fmtDate = (d) =>
      new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

    const wb = XLSX.utils.book_new();

    // Hoja 1: Ingresos
    const incomeHeader = ['Fecha', 'Estudiante', 'Documento', 'Medio', 'Recibido por', 'Nota', 'Verificado', 'Verificado por', 'Monto (COP)'];
    const wsIncome = XLSX.utils.aoa_to_sheet([
      ['INGRESOS — PAGOS DE ESTUDIANTES'],
      [`Rango: ${range.from} a ${range.to}`],
      [],
      incomeHeader,
      ...payments.map((p) => [
        fmtDate(p.paymentDate), p.student?.name || '', p.student?.document || '',
        p.method, p.receivedByName || '', p.note || '',
        p.verifiedAt ? 'Sí' : 'No', p.verifiedByName || '', parseFloat(p.amount),
      ]),
      [],
      ['', '', '', '', '', '', '', 'TOTAL INGRESOS', income.totals.total],
      ['', '', '', '', '', '', '', 'TOTAL VERIFICADO', income.totals.verifiedTotal],
      ['', '', '', '', '', '', '', 'SIN VERIFICAR', income.totals.unverifiedTotal],
      [],
      ['Por medio de pago'],
      ['Medio', 'Pagos', 'Total (COP)', 'Verificado (COP)'],
      ...Object.entries(income.byMethod).map(([method, m]) => [method, m.count, m.total, m.verifiedTotal]),
    ]);
    XLSX.utils.book_append_sheet(wb, wsIncome, 'Ingresos');

    // Hoja 2: Gastos (liquidación por quincena)
    const wsExpenses = XLSX.utils.aoa_to_sheet([
      ['GASTOS — LIQUIDACIÓN POR QUINCENA'],
      [`Rango: ${range.from} a ${range.to}`],
      [],
      ['Quincena', 'Clases', 'Profesores (COP)', 'Asistentes (COP)', 'Causado (COP)', 'Pagado (COP)', 'Pendiente de pago (COP)', 'Retenido (COP)', 'Estado'],
      ...expenses.rows.map((r) => [
        r.period, r.classCount, r.professorsAccrued, r.assistantsAccrued,
        r.accruedTotal, r.paidTotal, r.unpaidTotal, r.retainedTotal,
        r.locked ? 'Cerrada' : 'Abierta',
      ]),
      [],
      ['TOTAL', expenses.totals.classCount, expenses.totals.professorsAccrued, expenses.totals.assistantsAccrued,
        expenses.totals.accruedTotal, expenses.totals.paidTotal, expenses.totals.unpaidTotal, expenses.totals.retainedTotal, ''],
    ]);
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Gastos');

    // Hoja 3: Balance mensual
    const wsBalance = XLSX.utils.aoa_to_sheet([
      ['BALANCE — INGRESOS VS GASTOS'],
      [`Rango: ${range.from} a ${range.to}`],
      ['Los gastos se miden por causación (pagos habilitados). Los retenidos no entran al balance.'],
      [],
      ['Mes', 'Ingresos (COP)', 'Gastos causados (COP)', 'Gastos pagados (COP)', 'Resultado (COP)', 'Acumulado (COP)'],
      ...balance.rows.map((r) => [r.month, r.income, r.expensesAccrued, r.expensesPaid, r.net, r.cumulativeNet]),
      [],
      ['TOTAL', balance.totals.income, balance.totals.expensesAccrued, balance.totals.expensesPaid, balance.totals.net, ''],
      ['MARGEN', balance.totals.marginPct != null ? `${balance.totals.marginPct.toFixed(1)}%` : '—'],
    ]);
    XLSX.utils.book_append_sheet(wb, wsBalance, 'Balance');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="contabilidad-${range.from}-a-${range.to}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
