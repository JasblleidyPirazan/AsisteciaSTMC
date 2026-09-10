// Lógica pura del módulo de Contabilidad (Admin/Superadmin).
//
// Vistas sobre los datos que ya produce el sistema, más los gastos operativos
// que se registran a mano en el propio módulo:
//   Ingresos  = StudentPayment (registro de pagos de estudiantes) + verificación
//   Gastos    = CostRecord agrupado por quincena (la liquidación a profes/asistentes)
//               + OperatingExpense (gastos fijos y variables de la academia)
//   Balance   = ingresos vs gastos por mes calendario
//
// Criterio contable: los gastos se miden por CAUSACIÓN (todo CostRecord
// habilitado/PAYABLE es un compromiso de pago de la academia, esté o no
// marcado como "pago realizado") y se muestra aparte el flujo de CAJA
// (lo efectivamente pagado, paidAt). Los retenidos (SUSPENDED_LATE /
// PENDING_MATCH) no entran al balance: aún no son un gasto en firme.
const { getNextPeriod } = require('./costEngine');

const RETAINED_STATUSES = ['SUSPENDED_LATE', 'PENDING_MATCH'];

// Índice absoluto de una quincena (2 por mes) para poder iterar/ordenar.
function halfIndex(period) {
  const [y, m, h] = String(period).split('-').map(Number);
  return y * 24 + (m - 1) * 2 + (h - 1);
}

function periodFromDateStr(ymd) {
  const [year, month, day] = String(ymd).split('-');
  return `${year}-${month}-${Number(day) <= 15 ? '1' : '2'}`;
}

// Quincenas cubiertas por el rango [from, to] (strings YYYY-MM-DD), inclusivas.
function periodsBetween(from, to) {
  let p = periodFromDateStr(from);
  const end = halfIndex(periodFromDateStr(to));
  const out = [];
  while (halfIndex(p) <= end && out.length < 120) {
    out.push(p);
    p = getNextPeriod(p);
  }
  return out;
}

// Meses calendario (YYYY-MM) cubiertos por el rango, inclusivos.
function monthsBetween(from, to) {
  let [y, m] = String(from).split('-').map(Number);
  const [ey, em] = String(to).split('-').map(Number);
  const out = [];
  while ((y < ey || (y === ey && m <= em)) && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// Resumen de ingresos a partir de la lista de StudentPayment del rango.
function summarizeIncome(payments) {
  const totals = {
    total: 0, count: payments.length,
    verifiedTotal: 0, verifiedCount: 0,
    unverifiedTotal: 0, unverifiedCount: 0,
  };
  const byMethod = {};
  const byMonth = {};
  for (const p of payments) {
    const amount = parseFloat(p.amount);
    const verified = !!p.verifiedAt;
    totals.total += amount;
    if (verified) { totals.verifiedTotal += amount; totals.verifiedCount += 1; }
    else { totals.unverifiedTotal += amount; totals.unverifiedCount += 1; }

    if (!byMethod[p.method]) byMethod[p.method] = { total: 0, count: 0, verifiedTotal: 0 };
    byMethod[p.method].total += amount;
    byMethod[p.method].count += 1;
    if (verified) byMethod[p.method].verifiedTotal += amount;

    const month = new Date(p.paymentDate).toISOString().slice(0, 7);
    byMonth[month] = (byMonth[month] || 0) + amount;
  }
  return { totals, byMethod, byMonth };
}

// Gastos por quincena a partir de los CostRecord (con su cierre, si existe).
function summarizeExpenses(records, closures) {
  const closureByPeriod = {};
  for (const c of closures) closureByPeriod[c.period] = c;

  const byPeriod = {};
  const byMonth = {};
  for (const r of records) {
    if (!byPeriod[r.period]) {
      byPeriod[r.period] = {
        period: r.period, classCount: 0,
        professorsAccrued: 0, assistantsAccrued: 0,
        accruedTotal: 0, paidTotal: 0, unpaidTotal: 0, retainedTotal: 0,
      };
    }
    const row = byPeriod[r.period];
    const amount = parseFloat(r.total);
    row.classCount += 1;
    if (RETAINED_STATUSES.includes(r.payStatus)) {
      row.retainedTotal += amount;
    } else {
      row.accruedTotal += amount;
      if (r.payeeType === 'PROFESSOR') row.professorsAccrued += amount;
      else row.assistantsAccrued += amount;
      if (r.paidAt) row.paidTotal += amount;
      else row.unpaidTotal += amount;

      const month = String(r.period).slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { accrued: 0, paid: 0 };
      byMonth[month].accrued += amount;
      if (r.paidAt) byMonth[month].paid += amount;
    }
  }

  const rows = Object.values(byPeriod)
    .sort((a, b) => halfIndex(a.period) - halfIndex(b.period))
    .map((row) => {
      const closure = closureByPeriod[row.period];
      return {
        ...row,
        locked: !!closure?.locked,
        closedAt: closure?.closedAt || null,
        closedByName: closure?.closedByName || null,
      };
    });

  const totals = rows.reduce(
    (acc, r) => ({
      classCount: acc.classCount + r.classCount,
      professorsAccrued: acc.professorsAccrued + r.professorsAccrued,
      assistantsAccrued: acc.assistantsAccrued + r.assistantsAccrued,
      accruedTotal: acc.accruedTotal + r.accruedTotal,
      paidTotal: acc.paidTotal + r.paidTotal,
      unpaidTotal: acc.unpaidTotal + r.unpaidTotal,
      retainedTotal: acc.retainedTotal + r.retainedTotal,
    }),
    { classCount: 0, professorsAccrued: 0, assistantsAccrued: 0, accruedTotal: 0, paidTotal: 0, unpaidTotal: 0, retainedTotal: 0 }
  );

  return { rows, totals, byMonth };
}

// Fechas [from, to] (YYYY-MM-DD) que cubre una quincena "YYYY-MM-h":
// h=1 → días 1–15, h=2 → 16 al último día del mes.
function periodBounds(period) {
  const [y, m, h] = String(period).split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const lastDay = h === 1 ? 15 : new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${mm}-${h === 1 ? '01' : '16'}`, to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

// Fecha @db.Date (o string) → "YYYY-MM-DD" en UTC, que es como Postgres guarda
// las columnas DATE (sin hora, sin zona).
function dayStr(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

// ¿Este gasto se causa en esta quincena?
//   FIJO     → la quincena toca la vigencia [startDate, endDate]. endDate null =
//              vigente indefinidamente. Si la vigencia arranca o termina a mitad
//              de quincena, esa quincena SÍ cuenta completa (el gasto fijo es un
//              monto por quincena, no se prorratea por días).
//   VARIABLE → la quincena es exactamente la que tiene asignada.
function expenseCoversPeriod(expense, period) {
  if (expense.kind === 'VARIABLE') {
    return (expense.period || periodFromDateStr(dayStr(expense.expenseDate) || '')) === period;
  }
  const start = dayStr(expense.startDate);
  if (!start) return false;
  const end = dayStr(expense.endDate);
  const { from, to } = periodBounds(period);
  return start <= to && (!end || end >= from);
}

// Expande las definiciones de gastos operativos en una ocurrencia por quincena
// del rango y las agrega por quincena, mes y categoría.
//
// `expenses` viene de Prisma con `payments` incluido (las marcas de pago por
// quincena), y `periods` son las quincenas del rango pedido.
function expandOperatingExpenses(expenses, periods) {
  const occurrences = [];
  const byPeriod = {};
  for (const period of periods) {
    byPeriod[period] = {
      period, count: 0, fixedTotal: 0, variableTotal: 0,
      total: 0, paidTotal: 0, unpaidTotal: 0,
    };
  }

  for (const expense of expenses) {
    const paidByPeriod = {};
    for (const p of expense.payments || []) paidByPeriod[p.period] = p;
    const amount = parseFloat(expense.amount) || 0;

    for (const period of periods) {
      if (!expenseCoversPeriod(expense, period)) continue;
      const payment = paidByPeriod[period] || null;
      occurrences.push({
        expenseId: expense.id,
        period,
        kind: expense.kind,
        category: expense.category,
        concept: expense.concept,
        provider: expense.provider || null,
        note: expense.note || null,
        amount,
        startDate: dayStr(expense.startDate),
        endDate: dayStr(expense.endDate),
        expenseDate: dayStr(expense.expenseDate),
        paid: !!payment,
        paidAt: payment?.paidAt || null,
        paidByName: payment?.paidByName || null,
      });

      const row = byPeriod[period];
      row.count += 1;
      row.total += amount;
      if (expense.kind === 'FIJO') row.fixedTotal += amount;
      else row.variableTotal += amount;
      if (payment) row.paidTotal += amount;
      else row.unpaidTotal += amount;
    }
  }

  const rows = periods.map((p) => byPeriod[p]);

  const totals = rows.reduce(
    (acc, r) => ({
      count: acc.count + r.count,
      fixedTotal: acc.fixedTotal + r.fixedTotal,
      variableTotal: acc.variableTotal + r.variableTotal,
      total: acc.total + r.total,
      paidTotal: acc.paidTotal + r.paidTotal,
      unpaidTotal: acc.unpaidTotal + r.unpaidTotal,
    }),
    { count: 0, fixedTotal: 0, variableTotal: 0, total: 0, paidTotal: 0, unpaidTotal: 0 }
  );

  // Mes calendario de la quincena (para el balance) y categoría (para el desglose).
  const byMonth = {};
  const byCategory = {};
  for (const o of occurrences) {
    const month = String(o.period).slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { accrued: 0, paid: 0 };
    byMonth[month].accrued += o.amount;
    if (o.paid) byMonth[month].paid += o.amount;

    if (!byCategory[o.category]) byCategory[o.category] = { total: 0, count: 0, paidTotal: 0 };
    byCategory[o.category].total += o.amount;
    byCategory[o.category].count += 1;
    if (o.paid) byCategory[o.category].paidTotal += o.amount;
  }

  return { occurrences, rows, totals, byMonth, byCategory };
}

// Balance mensual: ingresos vs gastos causados, con resultado neto acumulado.
//
// El gasto de un mes = nómina de clases (payrollByMonth, de summarizeExpenses)
// + gastos operativos fijos y variables (operatingByMonth, de
// expandOperatingExpenses). `expensesAccrued`/`expensesPaid` son la suma de
// ambos; el desglose queda en payroll*/operating* para poder mostrarlo.
function buildBalance(months, incomeByMonth, payrollByMonth, operatingByMonth = {}) {
  let cumulativeNet = 0;
  const rows = months.map((month) => {
    const income = incomeByMonth[month] || 0;
    const pay = payrollByMonth[month] || { accrued: 0, paid: 0 };
    const ope = operatingByMonth[month] || { accrued: 0, paid: 0 };
    const expensesAccrued = pay.accrued + ope.accrued;
    const expensesPaid = pay.paid + ope.paid;
    const net = income - expensesAccrued;
    cumulativeNet += net;
    return {
      month, income,
      payrollAccrued: pay.accrued, payrollPaid: pay.paid,
      operatingAccrued: ope.accrued, operatingPaid: ope.paid,
      expensesAccrued, expensesPaid, net, cumulativeNet,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      income: acc.income + r.income,
      payrollAccrued: acc.payrollAccrued + r.payrollAccrued,
      payrollPaid: acc.payrollPaid + r.payrollPaid,
      operatingAccrued: acc.operatingAccrued + r.operatingAccrued,
      operatingPaid: acc.operatingPaid + r.operatingPaid,
      expensesAccrued: acc.expensesAccrued + r.expensesAccrued,
      expensesPaid: acc.expensesPaid + r.expensesPaid,
      net: acc.net + r.net,
    }),
    { income: 0, payrollAccrued: 0, payrollPaid: 0, operatingAccrued: 0, operatingPaid: 0, expensesAccrued: 0, expensesPaid: 0, net: 0 }
  );
  totals.marginPct = totals.income > 0 ? (totals.net / totals.income) * 100 : null;

  return { rows, totals };
}

module.exports = {
  periodsBetween,
  monthsBetween,
  periodBounds,
  periodFromDateStr,
  summarizeIncome,
  summarizeExpenses,
  expenseCoversPeriod,
  expandOperatingExpenses,
  buildBalance,
};
