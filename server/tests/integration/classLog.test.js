// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;
const D = (s) => new Date(`${s}T00:00:00Z`);
const G = { id: 'g1', code: 'LMV1', name: null, ballLevel: 'Verde', professor: { name: 'Juan' } };
const rec = (id, status) => ({ status, student: { id, name: id } });
const SESSIONS = [
  { id: 's1', date: D('2026-10-26'), status: 'REALIZADA', kind: 'REGULAR', groupId: 'g1', group: G,
    attendanceRecords: [rec('ana', 'PRESENTE'), rec('beto', 'JUSTIFICADA')] },
  { id: 's2', date: D('2026-10-28'), status: 'CANCELADA', kind: 'REGULAR', groupId: 'g1', group: G,
    cancellationCategory: 'LLUVIA', attendanceRecords: [] },
  { id: 's3', date: D('2026-10-29'), status: 'CANCELADA', kind: 'REGULAR', groupId: 'g2',
    group: { ...G, id: 'g2', code: 'MJ1' }, cancellationCategory: 'OTRA', cancellationReason: 'Torneo', attendanceRecords: [] },
];

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/reports', (await import('../../src/routes/reports.js')).default);
});
beforeEach(() => {
  resetPrisma();
  prismaMock.user = { findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co', role: 'ADMIN', active: true }) };
  prismaMock.classSession = { findMany: vi.fn().mockResolvedValue(SESSIONS) };
});
const get = (q = {}) => request(app).get('/api/reports/class-log').query(q).set('Authorization', `Bearer ${tokenFor({ id: 'u1', role: 'ADMIN' })}`);

describe('GET /reports/class-log — clases canceladas', () => {
  it('pide también las canceladas y las devuelve con su motivo', async () => {
    const res = await get();
    expect(prismaMock.classSession.findMany.mock.calls[0][0].where.status.in).toContain('CANCELADA');
    const rows = res.body.data.rows;
    expect(rows.find((r) => r.sessionId === 's2')).toMatchObject({ cancelled: true, cancellationCategory: 'LLUVIA', total: 0 });
    expect(rows.find((r) => r.sessionId === 's3')).toMatchObject({ cancelled: true, cancellationCategory: 'OTRA', cancellationReason: 'Torneo' });
    expect(rows.find((r) => r.sessionId === 's1').cancelled).toBe(false);
  });
  it('los totales cuentan aparte las canceladas (no suman a "Clases")', async () => {
    const { totals } = (await get()).body.data;
    expect(totals).toMatchObject({ classes: 1, present: 1, justified: 1, cancelled: 2, cancelledBy: { LLUVIA: 1, OTRA: 1, SIN_ESTUDIANTES: 0 } });
  });
  it('con filtro de estudiante: sus clases y las canceladas de sus grupos', async () => {
    const rows = (await get({ studentId: 'ana' })).body.data.rows.map((r) => r.sessionId);
    expect(rows).toEqual(['s1', 's2']);
  });
});
