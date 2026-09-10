const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../middleware/auth');
const XLSX = require('xlsx');
const {
  periodsBetween,
  monthsBetween,
  periodFromDateStr,
  summarizeIncome,
  summarizeExpenses,
  expandOperatingExpenses,
  expenseCoversPeriod,
  buildBalance,
} = require('../services/accounting');
const { attachStudentStatus } = require('../services/studentStatus');

const router = express.Router();

// Módulo 100% económico: solo ADMIN (SUPERADMIN pasa por superset de roles).
router.use(requireRole('ADMIN'));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}-[12]$/;

// Gastos operativos: naturalezas y categorías admitidas (espejo de los enums
// del schema, para validar sin depender de Prisma en los tests).
const EXPENSE_KINDS = ['FIJO', 'VARIABLE'];
const EXPENSE_CATEGORIES = [
  'ARRIENDO', 'SERVICIOS', 'NOMINA_ADMINISTRATIVA', 'MANTENIMIENTO',
  'IMPLEMENTOS', 'TRANSPORTE', 'MARKETING', 'IMPUESTOS_SEGUROS', 'OTRO',
];

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
  const [payments, records, closures, operatingExpenses] = await Promise.all([
    prisma.studentPayment.findMany({
      where: { paymentDate: { gte: new Date(from), lte: new Date(to) } },
      include: {
        student: {
          select: {
            id: true, name: true, document: true,
            enrollments: {
              orderBy: { enrollmentType: 'asc' },
              select: { group: { select: { code: true, ballLevel: true, professor: { select: { name: true } } } } },
            },
          },
        },
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.costRecord.findMany({
      where: { period: { in: periods } },
      select: { period: true, payeeType: true, payStatus: true, total: true, paidAt: true },
    }),
    prisma.payrollClosure.findMany({ where: { period: { in: periods } } }),
    // Los gastos fijos vigentes y los variables del rango: se traen todos los
    // activos y la expansión por quincena decide cuáles se causan (el filtro de
    // vigencia es un solapamiento de rangos, no una igualdad de fecha).
    prisma.operatingExpense.findMany({
      where: { active: true },
      include: { payments: { select: { period: true, paidAt: true, paidByName: true } } },
      orderBy: [{ kind: 'asc' }, { concept: 'asc' }],
    }),
  ]);

  const income = summarizeIncome(payments);
  const expenses = summarizeExpenses(records, closures);
  const operating = expandOperatingExpenses(operatingExpenses, periods);
  const balance = buildBalance(monthsBetween(from, to), income.byMonth, expenses.byMonth, operating.byMonth);

  return { payments, income, expenses, operating, balance };
}

// Pagos Estudiantes: estado de ingresos y deudas por estudiante ACTIVO, contra
// el valor de su plan (clases adquiridas × tarifa adulto/pequeño). No depende
// del rango de fechas: la deuda es contra el plan completo del semestre.
async function loadStudentTuition() {
  const students = await prisma.student.findMany({
    where: { active: true },
    include: {
      enrollments: {
        include: { group: { select: { code: true, ballLevel: true, professor: { select: { name: true } } } } },
        orderBy: { enrollmentType: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  const decorated = await attachStudentStatus(students);

  const rows = decorated.map((s) => {
    const primary = s.enrollments.find((e) => e.enrollmentType === 'PRIMARY') || s.enrollments[0];
    return {
      id: s.id,
      name: s.name,
      document: s.document,
      groupCode: primary?.group?.code || null,
      level: primary?.group?.ballLevel || null,
      professor: primary?.group?.professor?.name || null,
      studentStatus: s.studentStatus,
      missingBirthDate: s.missingBirthDate,
      category: s.tuition.category,
      classesAcquired: s.classesAcquired || 0,
      expectedTotal: s.tuition.expectedTotal,
      totalPaid: s.tuition.totalPaid,
      balance: s.tuition.balance,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      students: acc.students + 1,
      expected: acc.expected + (r.expectedTotal || 0),
      paid: acc.paid + (r.totalPaid || 0),
      debt: acc.debt + (r.balance || 0),
      matriculados: acc.matriculados + (r.studentStatus === 'MATRICULADO' ? 1 : 0),
      withDebt: acc.withDebt + (r.balance > 0 ? 1 : 0),
      missingBirthDate: acc.missingBirthDate + (r.missingBirthDate ? 1 : 0),
    }),
    { students: 0, expected: 0, paid: 0, debt: 0, matriculados: 0, withDebt: 0, missingBirthDate: 0 }
  );

  return { rows, totals };
}

// Resumen completo del módulo: ingresos (con detalle de pagos), gastos por
// quincena y balance mensual, para el rango [from, to].
router.get('/summary', async (req, res, next) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const [{ payments, income, expenses, operating, balance }, studentsTuition] = await Promise.all([
      loadSummary(range.from, range.to),
      loadStudentTuition(),
    ]);

    res.json({
      success: true,
      data: {
        from: range.from,
        to: range.to,
        studentsTuition,
        income: {
          ...income.totals,
          byMethod: income.byMethod,
          payments: payments.map((p) => {
            const enr = p.student?.enrollments || [];
            const grp = enr[0]?.group || null;
            return {
              id: p.id,
              paymentDate: p.paymentDate,
              method: p.method,
              amount: parseFloat(p.amount),
              note: p.note,
              receivedByName: p.receivedByName,
              verifiedAt: p.verifiedAt,
              verifiedByName: p.verifiedByName,
              student: p.student ? { id: p.student.id, name: p.student.name, document: p.student.document } : null,
              groupCode: grp?.code || null,
              level: grp?.ballLevel || null,
              professor: grp?.professor?.name || null,
            };
          }),
        },
        expenses: { rows: expenses.rows, totals: expenses.totals },
        operating: {
          rows: operating.rows,
          totals: operating.totals,
          byCategory: operating.byCategory,
          occurrences: operating.occurrences,
        },
        balance,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Fecha del primer pago registrado (para el rango por defecto de la vista).
router.get('/first-payment', async (req, res, next) => {
  try {
    const first = await prisma.studentPayment.findFirst({
      orderBy: { paymentDate: 'asc' },
      select: { paymentDate: true },
    });
    res.json({
      success: true,
      data: { firstPaymentDate: first ? new Date(first.paymentDate).toISOString().slice(0, 10) : null },
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

// ═══════════════ Gastos operativos (fijos y variables) ═══════════════
//
// Gastos de la academia que NO salen de la liquidación de clases: arriendo de
// canchas, servicios, implementos, nómina administrativa, etc.
//
//   FIJO     → el monto es POR QUINCENA y se causa en cada quincena que toque
//              la vigencia [startDate, endDate]. Sin fecha de fin, sigue
//              vigente hasta que se le ponga una (o se desactive el gasto).
//   VARIABLE → gasto de una sola vez, cargado a la quincena de su fecha.
//
// El "pago realizado" se marca por quincena (OperatingExpensePayment): un
// gasto fijo se paga quincena por quincena.

// "YYYY-MM-DD" → Date a medianoche UTC, que es como Prisma guarda y lee las
// columnas @db.Date (sin hora, sin zona). Construirla con `new Date(ymd)` a
// secas la interpretaría en la zona local del servidor y podría corrarla un día.
function toDate(ymd) {
  return ymd ? new Date(`${ymd}T00:00:00.000Z`) : null;
}
function dayOut(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

// Fila de gasto tal como la consume el frontend (Decimal → número, DATE → YYYY-MM-DD).
function serializeExpense(e) {
  return {
    id: e.id,
    kind: e.kind,
    category: e.category,
    concept: e.concept,
    amount: parseFloat(e.amount),
    startDate: dayOut(e.startDate),
    endDate: dayOut(e.endDate),
    period: e.period,
    expenseDate: dayOut(e.expenseDate),
    provider: e.provider,
    note: e.note,
    active: e.active,
    createdByName: e.createdByName,
    createdAt: e.createdAt,
    paidPeriods: (e.payments || []).map((p) => ({
      period: p.period, paidAt: p.paidAt, paidByName: p.paidByName,
    })),
  };
}

// Valida el cuerpo de creación/edición y devuelve el `data` para Prisma, o null
// si ya respondió con un 400.
function parseExpensePayload(body, res) {
  const fail = (error) => { res.status(400).json({ success: false, error }); return null; };

  const kind = String(body.kind || '').toUpperCase();
  if (!EXPENSE_KINDS.includes(kind)) return fail('El tipo de gasto debe ser FIJO o VARIABLE');

  const category = String(body.category || 'OTRO').toUpperCase();
  if (!EXPENSE_CATEGORIES.includes(category)) return fail('Categoría de gasto no válida');

  const concept = String(body.concept || '').trim();
  if (!concept) return fail('El concepto del gasto es obligatorio');
  if (concept.length > 200) return fail('El concepto no puede pasar de 200 caracteres');

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail('El monto debe ser un número mayor que cero');

  const provider = body.provider ? String(body.provider).trim().slice(0, 200) : null;
  const note = body.note ? String(body.note).trim().slice(0, 1000) : null;

  const data = { kind, category, concept, amount, provider, note };

  if (kind === 'FIJO') {
    const startDate = String(body.startDate || '');
    if (!DATE_RE.test(startDate)) return fail('Un gasto fijo necesita fecha de inicio (YYYY-MM-DD)');
    const endDate = body.endDate ? String(body.endDate) : null;
    if (endDate && !DATE_RE.test(endDate)) return fail('Fecha de fin no válida (YYYY-MM-DD)');
    if (endDate && endDate < startDate) return fail('La fecha de fin debe ser posterior a la de inicio');
    Object.assign(data, {
      startDate: toDate(startDate),
      endDate: toDate(endDate),
      period: null,
      expenseDate: null,
    });
  } else {
    const expenseDate = String(body.expenseDate || '');
    if (!DATE_RE.test(expenseDate)) return fail('Un gasto variable necesita la fecha del gasto (YYYY-MM-DD)');
    // La quincena sale de la fecha; se puede forzar otra si se manda explícita.
    const period = PERIOD_RE.test(String(body.period || '')) ? body.period : periodFromDateStr(expenseDate);
    Object.assign(data, {
      expenseDate: toDate(expenseDate),
      period,
      startDate: null,
      endDate: null,
    });
  }

  return data;
}

// Lista las definiciones de gastos (con sus quincenas pagadas).
// Por defecto solo los activos; `?includeInactive=true` trae también el archivo.
router.get('/expenses', async (req, res, next) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const expenses = await prisma.operatingExpense.findMany({
      where: includeInactive ? {} : { active: true },
      include: { payments: { select: { period: true, paidAt: true, paidByName: true } } },
      orderBy: [{ active: 'desc' }, { kind: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ success: true, data: expenses.map(serializeExpense) });
  } catch (err) {
    next(err);
  }
});

router.post('/expenses', async (req, res, next) => {
  try {
    const data = parseExpensePayload(req.body, res);
    if (!data) return;
    const created = await prisma.operatingExpense.create({
      data: { ...data, createdById: req.user.id, createdByName: req.user.email },
      include: { payments: { select: { period: true, paidAt: true, paidByName: true } } },
    });
    res.status(201).json({ success: true, data: serializeExpense(created) });
  } catch (err) {
    next(err);
  }
});

router.put('/expenses/:id', async (req, res, next) => {
  try {
    const existing = await prisma.operatingExpense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Gasto no encontrado' });

    const data = parseExpensePayload(req.body, res);
    if (!data) return;
    if (typeof req.body.active === 'boolean') data.active = req.body.active;

    const updated = await prisma.operatingExpense.update({
      where: { id: existing.id },
      data,
      include: { payments: { select: { period: true, paidAt: true, paidByName: true } } },
    });
    res.json({ success: true, data: serializeExpense(updated) });
  } catch (err) {
    next(err);
  }
});

// Archivar un gasto (active = false): deja de causarse de aquí en adelante pero
// conserva el histórico. `?permanent=true` lo borra de verdad, con sus marcas de
// pago — solo para corregir un registro creado por error.
router.delete('/expenses/:id', async (req, res, next) => {
  try {
    const existing = await prisma.operatingExpense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Gasto no encontrado' });

    if (String(req.query.permanent || '') === 'true') {
      await prisma.operatingExpense.delete({ where: { id: existing.id } });
      return res.json({ success: true, data: { id: existing.id, deleted: true } });
    }
    const updated = await prisma.operatingExpense.update({
      where: { id: existing.id },
      data: { active: false },
    });
    res.json({ success: true, data: { id: updated.id, active: updated.active } });
  } catch (err) {
    next(err);
  }
});

// Marcar/desmarcar como pagada UNA quincena de un gasto. Body: { period, paid }.
router.patch('/expenses/:id/paid', async (req, res, next) => {
  try {
    const { period } = req.body;
    if (!PERIOD_RE.test(String(period || ''))) {
      return res.status(400).json({ success: false, error: 'period requerido (YYYY-MM-1 o YYYY-MM-2)' });
    }
    const expense = await prisma.operatingExpense.findUnique({ where: { id: req.params.id } });
    if (!expense) return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
    if (!expenseCoversPeriod(expense, period)) {
      return res.status(400).json({ success: false, error: 'Ese gasto no se causa en esa quincena' });
    }

    const paid = req.body.paid !== false;
    if (!paid) {
      await prisma.operatingExpensePayment.deleteMany({ where: { expenseId: expense.id, period } });
      return res.json({ success: true, data: { expenseId: expense.id, period, paid: false } });
    }
    const mark = await prisma.operatingExpensePayment.upsert({
      where: { expenseId_period: { expenseId: expense.id, period } },
      create: { expenseId: expense.id, period, paidById: req.user.id, paidByName: req.user.email },
      update: { paidAt: new Date(), paidById: req.user.id, paidByName: req.user.email },
    });
    res.json({
      success: true,
      data: { expenseId: expense.id, period, paid: true, paidAt: mark.paidAt, paidByName: mark.paidByName },
    });
  } catch (err) {
    next(err);
  }
});

// Export Excel con las 5 hojas del módulo
// (Ingresos, Gastos, Gastos Operativos, Balance, Pagos Estudiantes).
router.get('/export', async (req, res, next) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const [{ payments, income, expenses, operating, balance }, studentsTuition] = await Promise.all([
      loadSummary(range.from, range.to),
      loadStudentTuition(),
    ]);

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

    // Hoja 3: Gastos Operativos — una fila por gasto y quincena causada
    const KIND_LABEL = { FIJO: 'Fijo', VARIABLE: 'Variable' };
    const CATEGORY_LABEL = {
      ARRIENDO: 'Arriendo', SERVICIOS: 'Servicios', NOMINA_ADMINISTRATIVA: 'Nómina administrativa',
      MANTENIMIENTO: 'Mantenimiento', IMPLEMENTOS: 'Implementos', TRANSPORTE: 'Transporte',
      MARKETING: 'Marketing', IMPUESTOS_SEGUROS: 'Impuestos y seguros', OTRO: 'Otro',
    };
    const wsOperating = XLSX.utils.aoa_to_sheet([
      ['GASTOS OPERATIVOS — FIJOS Y VARIABLES'],
      [`Rango: ${range.from} a ${range.to}`],
      ['Un gasto fijo aparece una vez por cada quincena de su vigencia (el monto es por quincena). Un gasto variable, solo en su quincena.'],
      [],
      ['Quincena', 'Tipo', 'Categoría', 'Concepto', 'Proveedor', 'Vigencia / Fecha', 'Pagado', 'Pagado por', 'Monto (COP)'],
      ...operating.occurrences.map((o) => [
        o.period,
        KIND_LABEL[o.kind] || o.kind,
        CATEGORY_LABEL[o.category] || o.category,
        o.concept,
        o.provider || '',
        o.kind === 'FIJO'
          ? `${o.startDate || ''} → ${o.endDate || 'sin fin'}`
          : (o.expenseDate || ''),
        o.paid ? 'Sí' : 'No',
        o.paidByName || '',
        o.amount,
      ]),
      [],
      ['', '', '', '', '', '', '', 'TOTAL CAUSADO', operating.totals.total],
      ['', '', '', '', '', '', '', 'FIJOS', operating.totals.fixedTotal],
      ['', '', '', '', '', '', '', 'VARIABLES', operating.totals.variableTotal],
      ['', '', '', '', '', '', '', 'PAGADO', operating.totals.paidTotal],
      ['', '', '', '', '', '', '', 'PENDIENTE DE PAGO', operating.totals.unpaidTotal],
      [],
      ['Por quincena'],
      ['Quincena', 'Gastos', 'Fijos (COP)', 'Variables (COP)', 'Total (COP)', 'Pagado (COP)', 'Pendiente (COP)'],
      ...operating.rows.map((r) => [r.period, r.count, r.fixedTotal, r.variableTotal, r.total, r.paidTotal, r.unpaidTotal]),
      [],
      ['Por categoría'],
      ['Categoría', 'Gastos', 'Total (COP)', 'Pagado (COP)'],
      ...Object.entries(operating.byCategory).map(([cat, c]) => [CATEGORY_LABEL[cat] || cat, c.count, c.total, c.paidTotal]),
    ]);
    XLSX.utils.book_append_sheet(wb, wsOperating, 'Gastos Operativos');

    // Hoja 4: Balance mensual
    const wsBalance = XLSX.utils.aoa_to_sheet([
      ['BALANCE — INGRESOS VS GASTOS'],
      [`Rango: ${range.from} a ${range.to}`],
      ['Los gastos se miden por causación (pagos habilitados + gastos fijos y variables). Los retenidos no entran al balance.'],
      [],
      ['Mes', 'Ingresos (COP)', 'Nómina de clases (COP)', 'Gastos operativos (COP)', 'Gastos causados (COP)', 'Gastos pagados (COP)', 'Resultado (COP)', 'Acumulado (COP)'],
      ...balance.rows.map((r) => [
        r.month, r.income, r.payrollAccrued, r.operatingAccrued,
        r.expensesAccrued, r.expensesPaid, r.net, r.cumulativeNet,
      ]),
      [],
      ['TOTAL', balance.totals.income, balance.totals.payrollAccrued, balance.totals.operatingAccrued,
        balance.totals.expensesAccrued, balance.totals.expensesPaid, balance.totals.net, ''],
      ['MARGEN', balance.totals.marginPct != null ? `${balance.totals.marginPct.toFixed(1)}%` : '—'],
    ]);
    XLSX.utils.book_append_sheet(wb, wsBalance, 'Balance');

    // Hoja 5: Pagos Estudiantes — estado de ingresos y deudas por estudiante
    const STATUS_LABEL = {
      MATRICULADO: 'Matriculado', INSCRITO: 'Inscrito', PREINSCRITO: 'Preinscrito',
      PRUEBA: 'Prueba', SUSPENDIDO: 'Suspendido', INACTIVO: 'Inactivo',
    };
    const t = studentsTuition.totals;
    const wsStudents = XLSX.utils.aoa_to_sheet([
      ['PAGOS ESTUDIANTES — INGRESOS Y DEUDAS'],
      ['Deuda = valor esperado del plan (clases adquiridas × tarifa adulto/pequeño) − total pagado. Incluye todos los estudiantes activos.'],
      [],
      ['Estudiante', 'Documento', 'Grupo', 'Estado', 'Categoría', 'Clases adquiridas', 'Valor esperado (COP)', 'Total pagado (COP)', 'Saldo pendiente (COP)'],
      ...studentsTuition.rows.map((r) => [
        r.name, r.document || '', r.groupCode || '',
        STATUS_LABEL[r.studentStatus] || r.studentStatus,
        r.category === 'ADULTO' ? 'Adulto' : r.category === 'PEQUENO' ? 'Pequeño' : '⚠️ Sin fecha de nacimiento',
        r.classesAcquired,
        r.expectedTotal ?? '',
        r.totalPaid,
        r.balance ?? '',
      ]),
      [],
      ['TOTAL', '', '', `${t.matriculados} matriculados · ${t.withDebt} con deuda`, '', '', t.expected, t.paid, t.debt],
      ...(t.missingBirthDate > 0
        ? [[`⚠️ ${t.missingBirthDate} estudiante(s) sin fecha de nacimiento: no se puede calcular su tarifa. Ingresa la fecha en su ficha.`]]
        : []),
    ]);
    XLSX.utils.book_append_sheet(wb, wsStudents, 'Pagos Estudiantes');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="contabilidad-${range.from}-a-${range.to}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
