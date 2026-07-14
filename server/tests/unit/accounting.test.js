import { describe, it, expect } from 'vitest';
import {
  periodsBetween,
  monthsBetween,
  summarizeIncome,
  summarizeExpenses,
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

describe('buildBalance', () => {
  it('cruza ingresos vs gastos por mes con neto acumulado y margen', () => {
    const { rows, totals } = buildBalance(
      ['2026-06', '2026-07'],
      { '2026-06': 200000, '2026-07': 100000 },
      { '2026-06': { accrued: 150000, paid: 120000 } }
    );
    expect(rows).toEqual([
      { month: '2026-06', income: 200000, expensesAccrued: 150000, expensesPaid: 120000, net: 50000, cumulativeNet: 50000 },
      { month: '2026-07', income: 100000, expensesAccrued: 0, expensesPaid: 0, net: 100000, cumulativeNet: 150000 },
    ]);
    expect(totals.net).toBe(150000);
    expect(totals.marginPct).toBe(50);
  });

  it('margen null sin ingresos (no divide por cero)', () => {
    const { totals } = buildBalance(['2026-06'], {}, { '2026-06': { accrued: 10000, paid: 0 } });
    expect(totals.marginPct).toBeNull();
    expect(totals.net).toBe(-10000);
  });
});
