import { describe, it, expect } from 'vitest';
import {
  periodsBetween,
  monthsBetween,
  periodBounds,
  summarizeIncome,
  summarizeExpenses,
  expenseCoversPeriod,
  expandOperatingExpenses,
  buildBalance,
} from '../../src/services/accounting.js';

describe('periodsBetween', () => {
  it('cubre las quincenas del rango, inclusivas', () => {
    expect(periodsBetween('2026-06-10', '2026-07-20')).toEqual([
      '2026-06-1', '2026-06-2', '2026-07-1', '2026-07-2',
    ]);
  });

  it('un rango dentro de una sola quincena devuelve solo esa', () => {
    expect(periodsBetween('2026-06-01', '2026-06-15')).toEqual(['2026-06-1']);
  });

  it('cruza el cambio de año', () => {
    expect(periodsBetween('2025-12-20', '2026-01-10')).toEqual(['2025-12-2', '2026-01-1']);
  });
});

describe('monthsBetween', () => {
  it('cubre los meses del rango, inclusivos, cruzando año', () => {
    expect(monthsBetween('2025-11-15', '2026-02-01')).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02',
    ]);
  });
});

describe('summarizeIncome', () => {
  const payments = [
    { amount: '100000', method: 'TRANSFERENCIA', verifiedAt: new Date(), paymentDate: '2026-06-05T00:00:00.000Z' },
    { amount: '50000', method: 'EFECTIVO', verifiedAt: null, paymentDate: '2026-06-20T00:00:00.000Z' },
    { amount: '80000', method: 'EFECTIVO', verifiedAt: new Date(), paymentDate: '2026-07-01T00:00:00.000Z' },
  ];

  it('separa verificado vs sin verificar y agrupa por medio y por mes', () => {
    const { totals, byMethod, byMonth } = summarizeIncome(payments);
    expect(totals).toEqual({
      total: 230000, count: 3,
      verifiedTotal: 180000, verifiedCount: 2,
      unverifiedTotal: 50000, unverifiedCount: 1,
    });
    expect(byMethod.TRANSFERENCIA).toEqual({ total: 100000, count: 1, verifiedTotal: 100000 });
    expect(byMethod.EFECTIVO).toEqual({ total: 130000, count: 2, verifiedTotal: 80000 });
    expect(byMonth).toEqual({ '2026-06': 150000, '2026-07': 80000 });
  });
});

describe('summarizeExpenses', () => {
  const records = [
    { period: '2026-06-1', payeeType: 'PROFESSOR', payStatus: 'PAYABLE', total: '60000', paidAt: new Date() },
    { period: '2026-06-1', payeeType: 'ASSISTANT', payStatus: 'PAYABLE', total: '12000', paidAt: null },
    { period: '2026-06-1', payeeType: 'PROFESSOR', payStatus: 'SUSPENDED_LATE', total: '45000', paidAt: null },
    { period: '2026-06-2', payeeType: 'ASSISTANT', payStatus: 'PENDING_MATCH', total: '12000', paidAt: null },
  ];

  it('agrupa por quincena separando causado, pagado y retenido', () => {
    const { rows, totals, byMonth } = summarizeExpenses(records, [
      { period: '2026-06-1', locked: true, closedAt: 'X', closedByName: 'admin@stmc.co' },
    ]);
    expect(rows).toHaveLength(2);
    const [q1, q2] = rows;
    expect(q1).toMatchObject({
      period: '2026-06-1', classCount: 3,
      professorsAccrued: 60000, assistantsAccrued: 12000,
      accruedTotal: 72000, paidTotal: 60000, unpaidTotal: 12000, retainedTotal: 45000,
      locked: true, closedByName: 'admin@stmc.co',
    });
    expect(q2).toMatchObject({ period: '2026-06-2', accruedTotal: 0, retainedTotal: 12000, locked: false });
    expect(totals).toMatchObject({ accruedTotal: 72000, paidTotal: 60000, retainedTotal: 57000 });
    // Los retenidos NO entran al gasto mensual del balance.
    expect(byMonth).toEqual({ '2026-06': { accrued: 72000, paid: 60000 } });
  });
});

describe('periodBounds', () => {
  it('1.ª quincena = días 1–15; 2.ª = 16 al último día del mes', () => {
    expect(periodBounds('2026-06-1')).toEqual({ from: '2026-06-01', to: '2026-06-15' });
    expect(periodBounds('2026-06-2')).toEqual({ from: '2026-06-16', to: '2026-06-30' });
    // Febrero de año no bisiesto y de bisiesto
    expect(periodBounds('2026-02-2').to).toBe('2026-02-28');
    expect(periodBounds('2028-02-2').to).toBe('2028-02-29');
  });
});

describe('expenseCoversPeriod', () => {
  const fijo = (startDate, endDate) => ({ kind: 'FIJO', startDate, endDate });

  it('un gasto fijo se causa en cada quincena que toque su vigencia', () => {
    const e = fijo('2026-06-01', '2026-07-15');
    expect(expenseCoversPeriod(e, '2026-05-2')).toBe(false);
    expect(expenseCoversPeriod(e, '2026-06-1')).toBe(true);
    expect(expenseCoversPeriod(e, '2026-06-2')).toBe(true);
    expect(expenseCoversPeriod(e, '2026-07-1')).toBe(true);
    expect(expenseCoversPeriod(e, '2026-07-2')).toBe(false);
  });

  it('la quincena donde arranca o termina la vigencia cuenta completa (no se prorratea)', () => {
    // Empieza el 10 → la quincena 1–15 cuenta entera.
    expect(expenseCoversPeriod(fijo('2026-06-10', null), '2026-06-1')).toBe(true);
    // Termina el 18 → la quincena 16–30 cuenta entera.
    expect(expenseCoversPeriod(fijo('2026-01-01', '2026-06-18'), '2026-06-2')).toBe(true);
  });

  it('sin fecha de fin sigue vigente indefinidamente', () => {
    const e = fijo('2026-06-01', null);
    expect(expenseCoversPeriod(e, '2027-12-2')).toBe(true);
    expect(expenseCoversPeriod(e, '2026-05-2')).toBe(false);
  });

  it('un gasto variable solo se causa en su propia quincena', () => {
    const e = { kind: 'VARIABLE', period: '2026-06-2', expenseDate: '2026-06-20' };
    expect(expenseCoversPeriod(e, '2026-06-2')).toBe(true);
    expect(expenseCoversPeriod(e, '2026-06-1')).toBe(false);
  });

  it('un gasto variable sin period cae en la quincena de su fecha', () => {
    const e = { kind: 'VARIABLE', period: null, expenseDate: '2026-06-03' };
    expect(expenseCoversPeriod(e, '2026-06-1')).toBe(true);
    expect(expenseCoversPeriod(e, '2026-06-2')).toBe(false);
  });

  it('un gasto fijo sin fecha de inicio no se causa nunca', () => {
    expect(expenseCoversPeriod(fijo(null, null), '2026-06-1')).toBe(false);
  });
});

describe('expandOperatingExpenses', () => {
  const periods = ['2026-06-1', '2026-06-2', '2026-07-1'];
  const expenses = [
    {
      id: 'e1', kind: 'FIJO', category: 'ARRIENDO', concept: 'Arriendo cancha', amount: '300000',
      startDate: '2026-06-01', endDate: '2026-06-30', provider: 'Club', note: null,
      payments: [{ period: '2026-06-1', paidAt: new Date('2026-06-15'), paidByName: 'admin@stmc.co' }],
    },
    {
      id: 'e2', kind: 'VARIABLE', category: 'IMPLEMENTOS', concept: 'Pelotas', amount: '150000',
      period: '2026-06-2', expenseDate: '2026-06-20', provider: null, note: null, payments: [],
    },
  ];

  it('expande el gasto fijo a una ocurrencia por quincena vigente', () => {
    const { occurrences } = expandOperatingExpenses(expenses, periods);
    const fijas = occurrences.filter((o) => o.expenseId === 'e1');
    expect(fijas.map((o) => o.period)).toEqual(['2026-06-1', '2026-06-2']);
    expect(fijas.every((o) => o.amount === 300000)).toBe(true);
    expect(fijas[0].paid).toBe(true);
    expect(fijas[0].paidByName).toBe('admin@stmc.co');
    expect(fijas[1].paid).toBe(false);
  });

  it('agrega por quincena separando fijos, variables, pagado y pendiente', () => {
    const { rows, totals } = expandOperatingExpenses(expenses, periods);
    expect(rows).toEqual([
      { period: '2026-06-1', count: 1, fixedTotal: 300000, variableTotal: 0, total: 300000, paidTotal: 300000, unpaidTotal: 0 },
      { period: '2026-06-2', count: 2, fixedTotal: 300000, variableTotal: 150000, total: 450000, paidTotal: 0, unpaidTotal: 450000 },
      { period: '2026-07-1', count: 0, fixedTotal: 0, variableTotal: 0, total: 0, paidTotal: 0, unpaidTotal: 0 },
    ]);
    expect(totals).toEqual({
      count: 3, fixedTotal: 600000, variableTotal: 150000,
      total: 750000, paidTotal: 300000, unpaidTotal: 450000,
    });
  });

  it('agrupa por mes calendario (para el balance) y por categoría', () => {
    const { byMonth, byCategory } = expandOperatingExpenses(expenses, periods);
    expect(byMonth).toEqual({ '2026-06': { accrued: 750000, paid: 300000 } });
    expect(byCategory).toEqual({
      ARRIENDO: { total: 600000, count: 2, paidTotal: 300000 },
      IMPLEMENTOS: { total: 150000, count: 1, paidTotal: 0 },
    });
  });

  it('sin gastos devuelve una fila en cero por quincena', () => {
    const { rows, totals, occurrences } = expandOperatingExpenses([], periods);
    expect(occurrences).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(totals.total).toBe(0);
  });
});

describe('buildBalance', () => {
  it('cruza ingresos vs gastos por mes con neto acumulado y margen', () => {
    const { rows, totals } = buildBalance(
      ['2026-06', '2026-07'],
      { '2026-06': 200000, '2026-07': 100000 },
      { '2026-06': { accrued: 150000, paid: 120000 } }
    );
    expect(rows).toEqual([
      {
        month: '2026-06', income: 200000,
        payrollAccrued: 150000, payrollPaid: 120000,
        operatingAccrued: 0, operatingPaid: 0,
        expensesAccrued: 150000, expensesPaid: 120000,
        net: 50000, cumulativeNet: 50000,
      },
      {
        month: '2026-07', income: 100000,
        payrollAccrued: 0, payrollPaid: 0,
        operatingAccrued: 0, operatingPaid: 0,
        expensesAccrued: 0, expensesPaid: 0,
        net: 100000, cumulativeNet: 150000,
      },
    ]);
    expect(totals.net).toBe(150000);
    expect(totals.marginPct).toBe(50);
  });

  it('suma los gastos operativos al gasto del mes, con el desglose aparte', () => {
    const { rows, totals } = buildBalance(
      ['2026-06'],
      { '2026-06': 1000000 },
      { '2026-06': { accrued: 150000, paid: 150000 } },
      { '2026-06': { accrued: 450000, paid: 300000 } }
    );
    expect(rows[0]).toMatchObject({
      payrollAccrued: 150000, operatingAccrued: 450000,
      expensesAccrued: 600000, expensesPaid: 450000,
      net: 400000,
    });
    expect(totals.operatingAccrued).toBe(450000);
    expect(totals.expensesAccrued).toBe(600000);
    expect(totals.marginPct).toBe(40);
  });

  it('margen null sin ingresos (no divide por cero)', () => {
    const { totals } = buildBalance(['2026-06'], {}, { '2026-06': { accrued: 10000, paid: 0 } });
    expect(totals.marginPct).toBeNull();
    expect(totals.net).toBe(-10000);
  });
});
