// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
    findMany: vi.fn().mockResolvedValue([{ id: 'actor1', email: 'coord@stmc.co' }]),
  };
  return tokenFor({ id, role });
}

function seedLogs() {
  prismaMock.sessionEditLog = {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'se1', sessionId: 's1', editedAt: new Date('2025-06-10T10:00:00Z'),
        editedBy: { email: 'prof@stmc.co' },
        session: { id: 's1', date: new Date('2025-06-10'), kind: 'REGULAR', title: null, group: { code: 'LM7' } },
      },
    ]),
  };
  prismaMock.studentGroupHistory = {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'gh1', studentId: 'st1', changedById: 'actor1', changedAt: new Date('2025-06-11T09:00:00Z'),
        actionType: 'TRANSFER', reason: 'Cambio de nivel',
        student: { name: 'Ana' }, fromGroup: { code: 'LM7' }, toGroup: { code: 'MJ8' },
      },
    ]),
  };
  prismaMock.payrollLog = {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'pl1', period: '2025-06-1', action: 'CLOSE', actorName: 'admin@stmc.co',
        at: new Date('2025-06-12T18:00:00Z'), detail: { count: 5 },
      },
    ]),
  };
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const auditRouter = (await import('../../src/routes/audit.js')).default;
  app = await buildApp('/api/audit', auditRouter);
});

beforeEach(() => {
  resetPrisma();
  seedLogs();
});

describe('GET /api/audit — auditoría unificada', () => {
  it('TEACHER → 403', async () => {
    const res = await request(app).get('/api/audit')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(403);
  });

  it('PHYSICAL_TRAINER (Coordinador) → 403 (solo ADMIN)', async () => {
    const res = await request(app).get('/api/audit')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`);
    expect(res.status).toBe(403);
  });

  it('ADMIN → 200 con los tres tipos, ordenados por fecha desc', async () => {
    const res = await request(app).get('/api/audit')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(res.status).toBe(200);
    const { events } = res.body.data;
    expect(events).toHaveLength(3);
    // Más reciente primero: PAYROLL (jun 12) → GROUP_CHANGE (jun 11) → SESSION_EDIT (jun 10)
    expect(events.map((e) => e.type)).toEqual(['PAYROLL', 'GROUP_CHANGE', 'SESSION_EDIT']);
    const gc = events.find((e) => e.type === 'GROUP_CHANGE');
    expect(gc.subject).toBe('Ana');
    expect(gc.detail).toBe('LM7 → MJ8');
    expect(gc.actor).toBe('coord@stmc.co'); // resuelto vía user.findMany
  });

  it('SUPERADMIN → 200 (superset)', async () => {
    const res = await request(app).get('/api/audit')
      .set('Authorization', `Bearer ${authAs('SUPERADMIN')}`);
    expect(res.status).toBe(200);
  });

  it('filtro type=PAYROLL solo consulta esa bitácora', async () => {
    const token = authAs('ADMIN');
    const res = await request(app).get('/api/audit?type=PAYROLL')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.events.map((e) => e.type)).toEqual(['PAYROLL']);
    expect(prismaMock.sessionEditLog.findMany).not.toHaveBeenCalled();
    expect(prismaMock.studentGroupHistory.findMany).not.toHaveBeenCalled();
    expect(prismaMock.payrollLog.findMany).toHaveBeenCalled();
  });
});
