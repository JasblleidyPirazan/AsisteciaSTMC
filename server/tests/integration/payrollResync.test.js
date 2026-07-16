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
  prismaMock.payrollClosure = { findUnique: vi.fn().mockResolvedValue(null) };
  prismaMock.payrollApproval = { findUnique: vi.fn().mockResolvedValue(null) };
  prismaMock.systemConfig = { findUnique: vi.fn().mockResolvedValue({ value: '2026-01-01' }) };
  prismaMock.costRecord = {
    findMany: vi.fn(),
    update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
  };
  prismaMock.$transaction = vi.fn().mockImplementation((ops) => Promise.all(ops));
});

describe('Coherencia Liquidación ↔ Validación: refresh de payStatus de asistentes', () => {
  it('un pago de asistente PENDING_MATCH cuya clase ya coincide (REGULAR MATCHED) se corrige a PAYABLE', async () => {
    const token = authAs('ADMIN');
    // 1ª llamada: refreshAssistantPayStatus lee los asistentes PAYABLE/PENDING.
    // 2ª llamada: el summary lee todos los records del período.
    const stalePending = {
      id: 'c1', period: '2026-07-1', payeeType: 'ASSISTANT', payStatus: 'PENDING_MATCH',
      total: '18000', assistantId: 'a1',
      session: { date: new Date('2026-07-14'), kind: 'REGULAR', consolidationStatus: 'MATCHED',
        assistantId: 'a1', assistantConfirmedId: 'a1', coordinatorValidatedAt: null },
    };
    prismaMock.costRecord.findMany
      .mockResolvedValueOnce([stalePending])   // dentro de refreshAssistantPayStatus
      .mockResolvedValueOnce([{ ...stalePending, payStatus: 'PAYABLE', assistant: { id: 'a1', name: 'Emi' } }]); // summary

    const res = await request(app).get('/api/payroll/summary?period=2026-07-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Se corrigió el registro stale a PAYABLE (sin borrarlo).
    expect(prismaMock.costRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1' }, data: { payStatus: 'PAYABLE' },
    }));
    // El progreso ya cuenta el pago como habilitado por validar, no en conflicto.
    expect(res.body.data.progress.conflict).toBe(0);
  });

  it('no sincroniza si la quincena está cerrada', async () => {
    const token = authAs('ADMIN');
    prismaMock.payrollClosure.findUnique.mockResolvedValue({ period: '2026-07-1', locked: true });
    prismaMock.costRecord.findMany.mockResolvedValue([]); // summary
    const res = await request(app).get('/api/payroll/summary?period=2026-07-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(prismaMock.costRecord.update).not.toHaveBeenCalled();
  });
});
