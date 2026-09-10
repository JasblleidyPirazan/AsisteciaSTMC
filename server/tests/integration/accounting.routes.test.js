// mockPrisma MUST be imported before the router so the require.cache
// injection lands before the CJS graph captures the prisma reference.
import { prismaMock, resetPrisma, mockStudentStatusDeps } from '../helpers/mockPrisma.js';
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

beforeEach(async () => {
  resetPrisma();
  prismaMock.user = { findUnique: vi.fn() };
  prismaMock.studentPayment = { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), update: vi.fn() };
  prismaMock.costRecord = { findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.payrollClosure = { findMany: vi.fn().mockResolvedValue([]) };
  // Gastos operativos (fijos y variables) + sus marcas de pago por quincena
  prismaMock.operatingExpense = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  prismaMock.operatingExpensePayment = { upsert: vi.fn(), deleteMany: vi.fn() };
  // Hoja "Pagos Estudiantes": lista de estudiantes activos + deps del estado derivado
  prismaMock.student = { findMany: vi.fn().mockResolvedValue([]) };
  await mockStudentStatusDeps();
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
    expect(res.body.data).toHaveProperty('operating');
    expect(res.body.data).toHaveProperty('balance');
    expect(res.body.data).toHaveProperty('studentsTuition');
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
      {
        month: '2026-06', income: 150000,
        payrollAccrued: 60000, payrollPaid: 60000,
        operatingAccrued: 0, operatingPaid: 0,
        expensesAccrued: 60000, expensesPaid: 60000,
        net: 90000, cumulativeNet: 90000,
      },
    ]);
    expect(balance.totals.marginPct).toBe(60);
  });

  it('suma los gastos operativos (fijos y variables) al gasto del balance', async () => {
    const token = authAs('ADMIN');
    prismaMock.studentPayment.findMany.mockResolvedValue([
      {
        id: 'p1', paymentDate: new Date('2026-06-05'), method: 'EFECTIVO', amount: '1000000',
        note: null, receivedByName: null, verifiedAt: null, verifiedByName: null,
        student: { id: 's1', name: 'Ana', document: '123' },
      },
    ]);
    prismaMock.costRecord.findMany.mockResolvedValue([
      { period: '2026-06-1', payeeType: 'PROFESSOR', payStatus: 'PAYABLE', total: '60000', paidAt: null },
    ]);
    prismaMock.operatingExpense.findMany.mockResolvedValue([
      // Fijo vigente todo junio -> se causa en las DOS quincenas del mes.
      {
        id: 'e1', kind: 'FIJO', category: 'ARRIENDO', concept: 'Arriendo cancha', amount: '300000',
        startDate: new Date('2026-06-01'), endDate: null, period: null, expenseDate: null,
        provider: 'Club', note: null,
        payments: [{ period: '2026-06-1', paidAt: new Date(), paidByName: 'admin@stmc.co' }],
      },
      // Variable del 20 de junio -> solo en la 2.a quincena.
      {
        id: 'e2', kind: 'VARIABLE', category: 'IMPLEMENTOS', concept: 'Pelotas', amount: '150000',
        startDate: null, endDate: null, period: '2026-06-2', expenseDate: new Date('2026-06-20'),
        provider: null, note: null, payments: [],
      },
    ]);

    const res = await request(app)
      .get('/api/accounting/summary?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const { operating, balance } = res.body.data;
    // 300k x 2 quincenas + 150k del variable
    expect(operating.totals).toMatchObject({
      count: 3, fixedTotal: 600000, variableTotal: 150000,
      total: 750000, paidTotal: 300000, unpaidTotal: 450000,
    });
    expect(operating.rows.map((r) => [r.period, r.total])).toEqual([
      ['2026-06-1', 300000], ['2026-06-2', 450000],
    ]);
    expect(operating.byCategory.ARRIENDO).toEqual({ total: 600000, count: 2, paidTotal: 300000 });

    // Balance: 1.000.000 - (60.000 nomina + 750.000 operativos) = 190.000
    expect(balance.rows[0]).toMatchObject({
      payrollAccrued: 60000, operatingAccrued: 750000,
      expensesAccrued: 810000, net: 190000,
    });
  });
});

describe('Gastos operativos — CRUD', () => {
  it('crea un gasto FIJO con vigencia', async () => {
    const token = authAs('ADMIN', 'a1');
    prismaMock.operatingExpense.create.mockImplementation(async ({ data }) => ({
      id: 'e1', active: true, createdAt: new Date(), payments: [], ...data,
    }));

    const res = await request(app)
      .post('/api/accounting/expenses')
      .send({
        kind: 'FIJO', category: 'ARRIENDO', concept: 'Arriendo cancha 3',
        amount: 300000, startDate: '2026-06-01', endDate: '2026-12-15', provider: 'Club',
      })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(prismaMock.operatingExpense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        kind: 'FIJO', category: 'ARRIENDO', amount: 300000,
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-12-15T00:00:00.000Z'),
        period: null, expenseDate: null,
        createdById: 'a1', createdByName: 'admin@stmc.co',
      }),
    }));
    expect(res.body.data).toMatchObject({ amount: 300000, startDate: '2026-06-01', endDate: '2026-12-15' });
  });

  it('crea un gasto VARIABLE y le deriva la quincena de su fecha', async () => {
    const token = authAs('ADMIN', 'a1');
    prismaMock.operatingExpense.create.mockImplementation(async ({ data }) => ({
      id: 'e2', active: true, createdAt: new Date(), payments: [], ...data,
    }));

    const res = await request(app)
      .post('/api/accounting/expenses')
      .send({ kind: 'VARIABLE', category: 'IMPLEMENTOS', concept: 'Pelotas', amount: 150000, expenseDate: '2026-06-20' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ period: '2026-06-2', expenseDate: '2026-06-20' });
  });

  it.each([
    ['sin tipo', { concept: 'X', amount: 1000 }],
    ['tipo invalido', { kind: 'MENSUAL', concept: 'X', amount: 1000 }],
    ['sin concepto', { kind: 'VARIABLE', amount: 1000, expenseDate: '2026-06-20' }],
    ['monto cero', { kind: 'VARIABLE', concept: 'X', amount: 0, expenseDate: '2026-06-20' }],
    ['monto no numerico', { kind: 'VARIABLE', concept: 'X', amount: 'mucho', expenseDate: '2026-06-20' }],
    ['fijo sin fecha de inicio', { kind: 'FIJO', concept: 'X', amount: 1000 }],
    ['fijo con fin antes del inicio', { kind: 'FIJO', concept: 'X', amount: 1000, startDate: '2026-06-10', endDate: '2026-06-01' }],
    ['variable sin fecha', { kind: 'VARIABLE', concept: 'X', amount: 1000 }],
    ['categoria invalida', { kind: 'VARIABLE', category: 'CERVEZA', concept: 'X', amount: 1000, expenseDate: '2026-06-20' }],
  ])('rechaza %s (400)', async (_label, body) => {
    const token = authAs('ADMIN');
    const res = await request(app)
      .post('/api/accounting/expenses')
      .send(body)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(prismaMock.operatingExpense.create).not.toHaveBeenCalled();
  });

  it('archiva un gasto sin borrarlo (DELETE -> active false)', async () => {
    const token = authAs('ADMIN');
    prismaMock.operatingExpense.findUnique.mockResolvedValue({ id: 'e1' });
    prismaMock.operatingExpense.update.mockResolvedValue({ id: 'e1', active: false });

    const res = await request(app)
      .delete('/api/accounting/expenses/e1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'e1', active: false });
    expect(prismaMock.operatingExpense.delete).not.toHaveBeenCalled();
  });

  it('borra de verdad con ?permanent=true', async () => {
    const token = authAs('ADMIN');
    prismaMock.operatingExpense.findUnique.mockResolvedValue({ id: 'e1' });
    prismaMock.operatingExpense.delete.mockResolvedValue({ id: 'e1' });

    const res = await request(app)
      .delete('/api/accounting/expenses/e1?permanent=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(prismaMock.operatingExpense.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
  });

  it.each(['TEACHER', 'RECEPTION', 'PHYSICAL_TRAINER'])('%s no puede crear gastos (403)', async (role) => {
    const token = authAs(role);
    const res = await request(app)
      .post('/api/accounting/expenses')
      .send({ kind: 'VARIABLE', concept: 'X', amount: 1000, expenseDate: '2026-06-20' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /accounting/expenses/:id/paid', () => {
  it('marca pagada una quincena de un gasto fijo', async () => {
    const token = authAs('ADMIN', 'a1');
    prismaMock.operatingExpense.findUnique.mockResolvedValue({
      id: 'e1', kind: 'FIJO', startDate: new Date('2026-06-01'), endDate: null,
    });
    prismaMock.operatingExpensePayment.upsert.mockImplementation(async ({ create }) => ({
      ...create, paidAt: new Date('2026-06-30'),
    }));

    const res = await request(app)
      .patch('/api/accounting/expenses/e1/paid')
      .send({ period: '2026-06-2', paid: true })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ expenseId: 'e1', period: '2026-06-2', paid: true, paidByName: 'admin@stmc.co' });
  });

  it('desmarca el pago (paid: false -> borra la marca)', async () => {
    const token = authAs('ADMIN');
    prismaMock.operatingExpense.findUnique.mockResolvedValue({
      id: 'e1', kind: 'FIJO', startDate: new Date('2026-06-01'), endDate: null,
    });
    prismaMock.operatingExpensePayment.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .patch('/api/accounting/expenses/e1/paid')
      .send({ period: '2026-06-2', paid: false })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(prismaMock.operatingExpensePayment.deleteMany).toHaveBeenCalledWith({
      where: { expenseId: 'e1', period: '2026-06-2' },
    });
  });

  it('rechaza una quincena en la que el gasto no se causa (400)', async () => {
    const token = authAs('ADMIN');
    prismaMock.operatingExpense.findUnique.mockResolvedValue({
      id: 'e1', kind: 'FIJO', startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30'),
    });

    const res = await request(app)
      .patch('/api/accounting/expenses/e1/paid')
      .send({ period: '2026-09-1', paid: true })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(prismaMock.operatingExpensePayment.upsert).not.toHaveBeenCalled();
  });

  it('exige un period con formato de quincena (400)', async () => {
    const token = authAs('ADMIN');
    const res = await request(app)
      .patch('/api/accounting/expenses/e1/paid')
      .send({ period: '2026-06', paid: true })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('404 si el gasto no existe', async () => {
    const token = authAs('ADMIN');
    prismaMock.operatingExpense.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch('/api/accounting/expenses/nope/paid')
      .send({ period: '2026-06-1', paid: true })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
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
