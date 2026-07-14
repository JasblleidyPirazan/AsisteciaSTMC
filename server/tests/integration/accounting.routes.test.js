// mockPrisma MUST be imported before the router so the require.cache
// injection lands before the CJS graph captures the prisma reference.
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;

function authAs(role, id = 'u1') {
  prismaMock.user.findUnique.mockResolvedValue({ id, email: `${role.toLowerCase()}@stmc.co`, role, active: true });
  return tokenFor({ id, role });
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const router = (await import('../../src/routes/accounting.js')).default
    || (await import('../../src/routes/accounting.js'));
  app = await buildApp('/api/accounting', router.default || router);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.user = { findUnique: vi.fn() };
  prismaMock.studentPayment = { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), update: vi.fn() };
  prismaMock.costRecord = { findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.payrollClosure = { findMany: vi.fn().mockResolvedValue([]) };
});

describe('GET /accounting/summary — guards de rol', () => {
  it.each(['TEACHER', 'ASSISTANT', 'PHYSICAL_TRAINER', 'RECEPTION', 'PARENT'])(
    'deniega a %s (403)', async (role) => {
      const token = authAs(role);
      const res = await request(app)
        .get('/api/accounting/summary?from=2026-06-01&to=2026-06-30')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  );

  it.each(['ADMIN', 'SUPERADMIN'])('permite a %s (200)', async (role) => {
    const token = authAs(role);
    const res = await request(app)
      .get('/api/accounting/summary?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('income');
    expect(res.body.data).toHaveProperty('expenses');
    expect(res.body.data).toHaveProperty('balance');
  });

  it('exige from/to válidos (400)', async () => {
    const token = authAs('ADMIN');
    const res = await request(app)
      .get('/api/accounting/summary?from=junio&to=2026-06-30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('rechaza from posterior a to (400)', async () => {
    const token = authAs('ADMIN');
    const res = await request(app)
      .get('/api/accounting/summary?from=2026-07-01&to=2026-06-01')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /accounting/summary — agregación', () => {
  it('resume ingresos, gastos por quincena y balance mensual', async () => {
    const token = authAs('ADMIN');
    prismaMock.studentPayment.findMany.mockResolvedValue([
      {
        id: 'p1', paymentDate: new Date('2026-06-05'), method: 'TRANSFERENCIA', amount: '100000',
        note: null, receivedByName: 'recep@stmc.co', verifiedAt: new Date(), verifiedByName: 'admin@stmc.co',
        student: { id: 's1', name: 'Ana', document: '123' },
      },
      {
        id: 'p2', paymentDate: new Date('2026-06-20'), method: 'EFECTIVO', amount: '50000',
        note: 'abono', receivedByName: 'recep@stmc.co', verifiedAt: null, verifiedByName: null,
        student: { id: 's2', name: 'Luis', document: '456' },
      },
    ]);
    prismaMock.costRecord.findMany.mockResolvedValue([
      { period: '2026-06-1', payeeType: 'PROFESSOR', payStatus: 'PAYABLE', total: '60000', paidAt: new Date() },
      { period: '2026-06-2', payeeType: 'ASSISTANT', payStatus: 'SUSPENDED_LATE', total: '12000', paidAt: null },
    ]);
    prismaMock.payrollClosure.findMany.mockResolvedValue([
      { period: '2026-06-1', locked: true, closedAt: new Date(), closedByName: 'admin@stmc.co' },
    ]);

    const res = await request(app)
      .get('/api/accounting/summary?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const { income, expenses, balance } = res.body.data;
    expect(income.total).toBe(150000);
    expect(income.verifiedTotal).toBe(100000);
    expect(income.unverifiedTotal).toBe(50000);
    expect(income.payments).toHaveLength(2);

    expect(expenses.totals.accruedTotal).toBe(60000);
    expect(expenses.totals.retainedTotal).toBe(12000);
    expect(expenses.rows.find((r) => r.period === '2026-06-1').locked).toBe(true);

    // Balance: ingresos 150k − gastos causados 60k (retenido excluido) = 90k
    expect(balance.rows).toEqual([
      { month: '2026-06', income: 150000, expensesAccrued: 60000, expensesPaid: 60000, net: 90000, cumulativeNet: 90000 },
    ]);
    expect(balance.totals.marginPct).toBe(60);
  });
});

describe('PATCH /accounting/payments/:id/verified', () => {
  it('marca un pago como verificado con auditoría', async () => {
    const token = authAs('ADMIN', 'a1');
    prismaMock.studentPayment.findUnique.mockResolvedValue({ id: 'p1' });
    prismaMock.studentPayment.update.mockImplementation(async ({ data }) => ({ id: 'p1', ...data }));

    const res = await request(app)
      .patch('/api/accounting/payments/p1/verified')
      .send({ verified: true })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(prismaMock.studentPayment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1' },
      data: expect.objectContaining({ verifiedById: 'a1', verifiedByName: 'admin@stmc.co' }),
    }));
    expect(res.body.data.verifiedByName).toBe('admin@stmc.co');
  });

  it('desmarca la verificación (verified: false → limpia auditoría)', async () => {
    const token = authAs('ADMIN', 'a1');
    prismaMock.studentPayment.findUnique.mockResolvedValue({ id: 'p1' });
    prismaMock.studentPayment.update.mockImplementation(async ({ data }) => ({ id: 'p1', ...data }));

    const res = await request(app)
      .patch('/api/accounting/payments/p1/verified')
      .send({ verified: false })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(prismaMock.studentPayment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { verifiedAt: null, verifiedById: null, verifiedByName: null },
    }));
  });

  it('404 si el pago no existe', async () => {
    const token = authAs('ADMIN');
    prismaMock.studentPayment.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch('/api/accounting/payments/nope/verified')
      .send({ verified: true })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('RECEPTION no puede verificar pagos (403)', async () => {
    const token = authAs('RECEPTION');
    const res = await request(app)
      .patch('/api/accounting/payments/p1/verified')
      .send({ verified: true })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
