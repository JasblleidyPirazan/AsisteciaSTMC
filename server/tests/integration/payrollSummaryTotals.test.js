// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

// Un CostRecord habilitado y ya sincronizado (no entra al refresh de asistentes).
function cost({ id, payeeType, payeeName, total, period = '2026-07-1' }) {
  const base = { id, period, payeeType, payStatus: 'PAYABLE', total, approvedAt: null, paidAt: null, heldAt: null };
  return payeeType === 'PROFESSOR'
    ? { ...base, professorId: `p-${payeeName}`, professor: { id: `p-${payeeName}`, name: payeeName } }
    : { ...base, assistantId: `a-${payeeName}`, assistant: { id: `a-${payeeName}`, name: payeeName } };
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const router = (await import('../../src/routes/payroll.js')).default;
  app = await buildApp('/api/payroll', router);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.payrollClosure = { findUnique: vi.fn().mockResolvedValue(null) };
  prismaMock.payrollApproval = { findUnique: vi.fn().mockResolvedValue(null) };
  prismaMock.systemConfig = { findUnique: vi.fn().mockResolvedValue({ value: '2026-01-01' }) };
  prismaMock.operatingExpense = { findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.$transaction = vi.fn().mockImplementation((ops) => Promise.all(ops));
});

describe('GET /payroll/summary — totales de clases y gastos de la quincena', () => {
  it('cuenta las clases de profesores y de asistentes por separado', async () => {
    const token = authAs('ADMIN');
    const records = [
      cost({ id: 'c1', payeeType: 'PROFESSOR', payeeName: 'Ana', total: '40000' }),
      cost({ id: 'c2', payeeType: 'PROFESSOR', payeeName: 'Ana', total: '40000' }),
      cost({ id: 'c3', payeeType: 'PROFESSOR', payeeName: 'Beto', total: '38000' }),
      cost({ id: 'c4', payeeType: 'ASSISTANT', payeeName: 'Caro', total: '18000' }),
    ];
    // 1ª llamada: refreshAssistantPayStatus; 2ª: el summary.
    prismaMock.costRecord = {
      findMany: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(records),
      update: vi.fn(),
    };

    const res = await request(app).get('/api/payroll/summary?period=2026-07-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.classesProfessors).toBe(3);
    expect(res.body.data.classesAssistants).toBe(1);
    expect(res.body.data.totalProfessors).toBe(118000);
    expect(res.body.data.totalAssistants).toBe(18000);
    expect(res.body.data.grandTotal).toBe(136000);
  });

  it('suma los gastos fijos y variables causados en la quincena al total del período', async () => {
    const token = authAs('ADMIN');
    prismaMock.costRecord = {
      findMany: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([cost({ id: 'c1', payeeType: 'PROFESSOR', payeeName: 'Ana', total: '40000' })]),
      update: vi.fn(),
    };
    prismaMock.operatingExpense.findMany.mockResolvedValue([
      // Fijo vigente: se causa en la quincena 2026-07-1 (1 al 15 de julio).
      { id: 'e1', kind: 'FIJO', category: 'ARRIENDO', concept: 'Arriendo cancha', amount: '1200000',
        startDate: new Date('2026-01-01'), endDate: null, provider: 'Club', note: null,
        payments: [{ period: '2026-07-1', paidAt: new Date('2026-07-10'), paidByName: 'Admin' }] },
      // Variable de ESA quincena.
      { id: 'e2', kind: 'VARIABLE', category: 'IMPLEMENTOS', concept: 'Pelotas', amount: '300000',
        period: '2026-07-1', expenseDate: new Date('2026-07-03'), provider: null, note: null, payments: [] },
      // Variable de OTRA quincena: no debe contarse.
      { id: 'e3', kind: 'VARIABLE', category: 'TRANSPORTE', concept: 'Bus torneo', amount: '500000',
        period: '2026-07-2', expenseDate: new Date('2026-07-20'), provider: null, note: null, payments: [] },
    ]);

    const res = await request(app).get('/api/payroll/summary?period=2026-07-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const { operating, grandTotal, periodTotal } = res.body.data;
    expect(operating.occurrences).toHaveLength(2);
    expect(operating.totals.fixedTotal).toBe(1200000);
    expect(operating.totals.variableTotal).toBe(300000);
    expect(operating.totals.total).toBe(1500000);
    // El arriendo ya está marcado como pagado en esta quincena; las pelotas no.
    expect(operating.totals.paidTotal).toBe(1200000);
    expect(operating.totals.unpaidTotal).toBe(300000);
    // La fila que suma todo: nómina habilitada + gastos operativos.
    expect(grandTotal).toBe(40000);
    expect(periodTotal).toBe(1540000);
  });

  it('solo pide los gastos activos (los archivados no se causan)', async () => {
    const token = authAs('ADMIN');
    prismaMock.costRecord = { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() };

    await request(app).get('/api/payroll/summary?period=2026-07-1')
      .set('Authorization', `Bearer ${token}`);

    expect(prismaMock.operatingExpense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } })
    );
  });
});
