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
  const payrollRouter = (await import('../../src/routes/payroll.js')).default;
  app = await buildApp('/api/payroll', payrollRouter);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.professor = { findUnique: vi.fn().mockResolvedValue({ id: 'p1' }) };
  prismaMock.assistant = { findUnique: vi.fn().mockResolvedValue({ id: 'a1' }) };
  prismaMock.semester = { findFirst: vi.fn().mockResolvedValue({ name: '2025-2', startDate: new Date('2025-06-01'), endDate: new Date('2025-11-30') }) };
  prismaMock.costRecord = {
    findMany: vi.fn().mockResolvedValue([
      { total: '30000', payStatus: 'PAYABLE', paidAt: new Date('2025-06-20') }, // pagado
      { total: '30000', payStatus: 'PAYABLE', paidAt: null },                    // pendiente habilitado
      { total: '30000', payStatus: 'SUSPENDED_LATE', paidAt: null },             // retenido
      { total: '15000', payStatus: 'PENDING_MATCH', paidAt: null },              // retenido
    ]),
  };
});

describe('GET /api/payroll/my-semester — acumulado del semestre', () => {
  it('ADMIN → 403 (no es autoservicio)', async () => {
    const res = await request(app).get('/api/payroll/my-semester')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(res.status).toBe(403);
  });

  it('TEACHER → separa pagado / pendiente / retenido', async () => {
    const res = await request(app).get('/api/payroll/my-semester')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.paidTotal).toBe(30000);
    expect(d.pendingPayableTotal).toBe(30000);
    expect(d.retainedTotal).toBe(45000);
    expect(d.classCount).toBe(4);
    expect(d.semesterName).toBe('2025-2');
    // Filtra por el profesor y el tipo PROFESSOR
    const where = prismaMock.costRecord.findMany.mock.calls[0][0].where;
    expect(where.professorId).toBe('p1');
    expect(where.payeeType).toBe('PROFESSOR');
  });

  it('ASSISTANT → filtra por asistente', async () => {
    const res = await request(app).get('/api/payroll/my-semester')
      .set('Authorization', `Bearer ${authAs('ASSISTANT')}`);
    expect(res.status).toBe(200);
    const where = prismaMock.costRecord.findMany.mock.calls[0][0].where;
    expect(where.assistantId).toBe('a1');
    expect(where.payeeType).toBe('ASSISTANT');
  });
});
