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

// Captura de lo que el cierre escribe dentro de su transacción.
function mockTransaction() {
  const tx = {
    payrollClosure: { upsert: vi.fn().mockResolvedValue({ id: 'cl1', closedAt: new Date() }) },
    payrollClosureLine: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    costRecord: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    payrollLog: { create: vi.fn().mockResolvedValue({}) },
  };
  prismaMock.$transaction = vi.fn().mockImplementation((fn) => fn(tx));
  return tx;
}

const APPROVED = new Date('2026-07-20T10:00:00Z');

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const router = (await import('../../src/routes/payroll.js')).default;
  app = await buildApp('/api/payroll', router);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.payrollClosure = { findUnique: vi.fn().mockResolvedValue(null) };
  prismaMock.costRecord = { findMany: vi.fn() };
});

describe('POST /payroll/close — el cierre certifica el pago', () => {
  it('marca como pagados los aprobados que aún no lo estaban', async () => {
    const token = authAs('ADMIN');
    const tx = mockTransaction();
    prismaMock.costRecord.findMany.mockResolvedValue([
      // Aprobado y sin pagar → el cierre lo marca pagado.
      { id: 'c1', period: '2026-07-2', payStatus: 'PAYABLE', total: '18000', payeeType: 'ASSISTANT',
        assistantId: 'a1', assistant: { name: 'Juan Manuel' }, approvedAt: APPROVED, heldAt: null, paidAt: null },
      // Ya pagado a mano antes de cerrar → no se vuelve a tocar.
      { id: 'c2', period: '2026-07-2', payStatus: 'PAYABLE', total: '18000', payeeType: 'ASSISTANT',
        assistantId: 'a1', assistant: { name: 'Juan Manuel' }, approvedAt: APPROVED, heldAt: null, paidAt: new Date() },
    ]);

    const res = await request(app).post('/api/payroll/close').send({ period: '2026-07-2' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.markedPaid).toBe(1);
    // Solo el aprobado-sin-pagar entra al updateMany.
    expect(tx.costRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['c1'] } },
      data: expect.objectContaining({ paidById: 'u1' }),
    }));
    expect(tx.costRecord.updateMany.mock.calls[0][0].data.paidAt).toBeInstanceOf(Date);
    // Queda auditado quién y por qué.
    const logs = tx.payrollLog.create.mock.calls.map((c) => c[0].data);
    const bulk = logs.find((l) => l.action === 'BULK_PAY');
    expect(bulk.detail).toMatchObject({ count: 1, reason: 'cierre de quincena' });
  });

  it('NO marca como pagado un retenido, y lo saca del total pagado de la foto', async () => {
    const token = authAs('ADMIN');
    const tx = mockTransaction();
    prismaMock.costRecord.findMany.mockResolvedValue([
      { id: 'c1', period: '2026-07-2', payStatus: 'PAYABLE', total: '40000', payeeType: 'PROFESSOR',
        professorId: 'p1', professor: { name: 'Ana' }, approvedAt: APPROVED, heldAt: null, paidAt: null },
      // Retenido a propósito: se decidió no pagarlo.
      { id: 'c2', period: '2026-07-2', payStatus: 'PAYABLE', total: '40000', payeeType: 'PROFESSOR',
        professorId: 'p1', professor: { name: 'Ana' }, approvedAt: null, heldAt: new Date(), paidAt: null },
    ]);

    const res = await request(app).post('/api/payroll/close').send({ period: '2026-07-2' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.markedPaid).toBe(1);
    expect(tx.costRecord.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ['c1'] } });
    // La foto del cierre separa pagado de retenido (antes sumaba el retenido como pagado).
    const line = tx.payrollClosureLine.createMany.mock.calls[0][0].data[0];
    expect(line.totalPaid).toBe(40000);
    expect(line.snapshot.totalHeld).toBe(40000);
    expect(line.totalCarried).toBe(0);
  });

  it('un suspendido se arrastra a la quincena siguiente y no se marca pagado', async () => {
    const token = authAs('ADMIN');
    const tx = mockTransaction();
    prismaMock.costRecord.findMany.mockResolvedValue([
      { id: 'c1', period: '2026-07-2', payStatus: 'SUSPENDED_LATE', total: '18000', payeeType: 'ASSISTANT',
        assistantId: 'a1', assistant: { name: 'Juan Manuel' }, approvedAt: null, heldAt: null, paidAt: null },
    ]);

    const res = await request(app).post('/api/payroll/close').send({ period: '2026-07-2' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.markedPaid).toBe(0);
    expect(res.body.data.carried).toBe(1);
    // El único updateMany es el del arrastre (cambia period), no un pago.
    const calls = tx.costRecord.updateMany.mock.calls.map((c) => c[0].data);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ period: '2026-08-1', carriedFromPeriod: '2026-07-2' });
    const line = tx.payrollClosureLine.createMany.mock.calls[0][0].data[0];
    expect(line.totalCarried).toBe(18000);
    expect(line.totalPaid).toBe(0);
  });

  it('sigue sin dejar cerrar si queda un pago sin validar ni retener', async () => {
    const token = authAs('ADMIN');
    const tx = mockTransaction();
    prismaMock.costRecord.findMany.mockResolvedValue([
      { id: 'c1', period: '2026-07-2', payStatus: 'PAYABLE', total: '18000', payeeType: 'ASSISTANT',
        assistantId: 'a1', assistant: { name: 'Juan Manuel' }, approvedAt: null, heldAt: null, paidAt: null },
    ]);

    const res = await request(app).post('/api/payroll/close').send({ period: '2026-07-2' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sin aprobar ni retener/i);
    // Nada se pagó ni se cerró.
    expect(tx.costRecord.updateMany).not.toHaveBeenCalled();
  });
});
