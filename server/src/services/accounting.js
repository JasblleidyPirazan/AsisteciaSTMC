// Lógica pura del módulo de Contabilidad (Admin/Superadmin).
//
// Tres vistas sobre los datos que ya produce el sistema:
//   Ingresos  = StudentPayment (registro de pagos de estudiantes) + verificación
//   Gastos    = CostRecord agrupado por quincena (la liquidación a profes/asistentes)
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

// Balance mensual: ingresos vs gastos causados, con resultado neto acumulado.
function buildBalance(months, incomeByMonth, expensesByMonth) {
  let cumulativeNet = 0;
  const rows = months.map((month) => {
    const income = incomeByMonth[month] || 0;
    const exp = expensesByMonth[month] || { accrued: 0, paid: 0 };
    const net = income - exp.accrued;
    cumulativeNet += net;
    return { month, income, expensesAccrued: exp.accrued, expensesPaid: exp.paid, net, cumulativeNet };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      income: acc.income + r.income,
      expensesAccrued: acc.expensesAccrued + r.expensesAccrued,
      expensesPaid: acc.expensesPaid + r.expensesPaid,
      net: acc.net + r.net,
    }),
    { income: 0, expensesAccrued: 0, expensesPaid: 0, net: 0 }
  );
  totals.marginPct = totals.income > 0 ? (totals.net / totals.income) * 100 : null;

  return { rows, totals };
}

module.exports = { periodsBetween, monthsBetween, summarizeIncome, summarizeExpenses, buildBalance };
