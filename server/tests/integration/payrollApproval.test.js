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

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const router = (await import('../../src/routes/payroll.js')).default;
  app = await buildApp('/api/payroll', router);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.payrollClosure = { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.payrollLog = { create: vi.fn().mockResolvedValue({}) };
  prismaMock.costRecord = {
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data })),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
});

const token = () => authAs('ADMIN');

describe('Flujo de aprobación de pagos (Aprobado → Pagado)', () => {
  it('aprueba un pago PAYABLE (limpia held)', async () => {
    prismaMock.costRecord.findUnique.mockResolvedValue({ id: 'c1', period: '2026-07-2', payStatus: 'PAYABLE', total: '38000', payeeType: 'ASSISTANT' });
    const res = await request(app).patch('/api/payroll/records/c1/approved').send({ approved: true })
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    const data = prismaMock.costRecord.update.mock.calls[0][0].data;
    expect(data.approvedById).toBe('u1');
    expect(data.heldAt).toBeNull();
  });

  it('NO permite aprobar un pago en conflicto (PENDING_MATCH) → 400', async () => {
    prismaMock.costRecord.findUnique.mockResolvedValue({ id: 'c1', period: '2026-07-2', payStatus: 'PENDING_MATCH', total: '18000' });
    const res = await request(app).patch('/api/payroll/records/c1/approved').send({ approved: true })
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(400);
    expect(prismaMock.costRecord.update).not.toHaveBeenCalled();
  });

  it('NO permite marcar pagado sin aprobar antes → 400 (secuencial)', async () => {
    prismaMock.costRecord.findUnique.mockResolvedValue({ id: 'c1', period: '2026-07-2', payStatus: 'PAYABLE', approvedAt: null, total: '38000' });
    const res = await request(app).patch('/api/payroll/records/c1/paid').send({ paid: true })
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/aprobar/i);
  });

  it('permite marcar pagado si ya está aprobado', async () => {
    prismaMock.costRecord.findUnique.mockResolvedValue({ id: 'c1', period: '2026-07-2', payStatus: 'PAYABLE', approvedAt: new Date(), total: '38000', payeeType: 'PROFESSOR' });
    const res = await request(app).patch('/api/payroll/records/c1/paid').send({ paid: true })
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
  });

  it('retener limpia la aprobación', async () => {
    prismaMock.costRecord.findUnique.mockResolvedValue({ id: 'c1', period: '2026-07-2', payStatus: 'PAYABLE', paidAt: null, total: '38000' });
    const res = await request(app).patch('/api/payroll/records/c1/held').send({ held: true })
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    const data = prismaMock.costRecord.update.mock.calls[0][0].data;
    expect(data.heldById).toBe('u1');
    expect(data.approvedAt).toBeNull();
  });

  it('acción masiva approve solo toca los PAYABLE no pagados', async () => {
    prismaMock.costRecord.findMany.mockResolvedValue([
      { id: 'a', period: '2026-07-2', payStatus: 'PAYABLE', paidAt: null },
      { id: 'b', period: '2026-07-2', payStatus: 'PENDING_MATCH', paidAt: null }, // conflicto, se ignora
      { id: 'c', period: '2026-07-2', payStatus: 'PAYABLE', paidAt: new Date() },  // ya pagado, se ignora
    ]);
    const res = await request(app).post('/api/payroll/records/bulk').send({ ids: ['a', 'b', 'c'], action: 'approve' })
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 1, skipped: 2 });
    expect(prismaMock.costRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['a'] } } }));
  });

  it('no aprueba en una quincena cerrada → 409', async () => {
    prismaMock.costRecord.findUnique.mockResolvedValue({ id: 'c1', period: '2026-07-2', payStatus: 'PAYABLE', total: '38000' });
    prismaMock.payrollClosure.findUnique.mockResolvedValue({ period: '2026-07-2', locked: true });
    const res = await request(app).patch('/api/payroll/records/c1/approved').send({ approved: true })
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(409);
  });
});
