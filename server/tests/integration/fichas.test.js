// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma, mockLedgerDeps } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;
function authAs(role) {
  prismaMock.user = { findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co', role, active: true }) };
  return `Bearer ${tokenFor({ id: 'u1', role })}`;
}
const post = (body, role = 'ADMIN') => request(app).post('/api/reports/students/fichas').set('Authorization', authAs(role)).send(body);

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/reports', (await import('../../src/routes/reports.js')).default);
});
beforeEach(async () => {
  resetPrisma();
  await mockLedgerDeps({ semester: null });
});

describe('POST /reports/students/fichas', () => {
  it('ADMIN y Coordinador; Profesor y Recepción no', async () => {
    expect((await post({ studentIds: ['s1'] }, 'TEACHER')).status).toBe(403);
    expect((await post({ studentIds: ['s1'] }, 'RECEPTION')).status).toBe(403);
    expect((await post({ studentIds: ['s1'] }, 'PHYSICAL_TRAINER')).status).toBe(409); // sin semestre activo
  });
  it('valida la lista de estudiantes', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ studentIds: [] })).status).toBe(400);
    expect((await post({ studentIds: Array.from({ length: 501 }, (_, i) => `s${i}`) })).status).toBe(400);
  });
  it('con semestre activo devuelve el documento imprimible', async () => {
    const D = (s) => new Date(`${s}T00:00:00Z`);
    const semester = { id: 'sem', name: '2026-2', startDate: D('2026-07-14'), endDate: D('2026-12-12'), active: true, exclusions: [] };
    await mockLedgerDeps({
      semester,
      students: [{ id: 's1', name: 'Ana', active: true, isTrial: false, classesAcquired: 40, previousClasses: 0, birthDate: D('2015-01-01'), enrollments: [] }],
    });
    const res = await post({ studentIds: ['s1', 'no-existe'] });
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
    expect(res.body.data.html).toContain('Avance de clases de Ana');
    expect(res.body.data.html).toContain('El semestre finaliza el 12 de diciembre');
  });
});
