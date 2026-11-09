// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma, mockLedgerDeps } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;
const D = (s) => new Date(`${s}T00:00:00Z`);
const SEM = { id: 's2', name: '2026-2', startDate: D('2026-07-14'), endDate: D('2026-12-05'), active: false, exclusions: [{ date: D('2026-12-08'), reason: 'Festivo' }] };

function authAs(role) {
  prismaMock.user = { findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co', role, active: true }) };
  return `Bearer ${tokenFor({ id: 'u1', role })}`;
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/semesters', (await import('../../src/routes/semesters.js')).default);
});
beforeEach(() => {
  resetPrisma();
  prismaMock.semester = {
    findUnique: vi.fn().mockResolvedValue(SEM),
    findMany: vi.fn().mockResolvedValue([{ id: 's2', name: '2026-2', startDate: SEM.startDate }, { id: 's3', name: '2027-1', startDate: D('2027-01-19') }]),
    update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...SEM, ...data })),
  };
});

const extend = (body, role = 'ADMIN') => request(app).post('/api/semesters/s2/extend').set('Authorization', authAs(role)).send(body);

describe('POST /semesters/:id/extend', () => {
  it('solo ADMIN/SUPERADMIN', async () => {
    expect((await extend({ endDate: '2026-12-12' }, 'PHYSICAL_TRAINER')).status).toBe(403);
    expect((await extend({ endDate: '2026-12-12' }, 'SUPERADMIN')).status).toBe(200);
  });
  it('por defecto es vista previa: no guarda y lista los festivos del período nuevo', async () => {
    const res = await extend({ endDate: '2026-12-12' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ from: '2026-12-05', to: '2026-12-12', days: 7, applied: false });
    expect(res.body.data.exclusionsInRange).toEqual([{ date: '2026-12-08', reason: 'Festivo' }]);
    expect(prismaMock.semester.update).not.toHaveBeenCalled();
  });
  it('con dryRun=false guarda la nueva fecha de fin', async () => {
    const res = await extend({ endDate: '2026-12-12', dryRun: false });
    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(true);
    expect(prismaMock.semester.update).toHaveBeenCalledWith(expect.objectContaining({ data: { endDate: D('2026-12-12') } }));
  });
  it('rechaza acortar o pasar al semestre siguiente sin guardar nada', async () => {
    expect((await extend({ endDate: '2026-12-01', dryRun: false })).status).toBe(400);
    const res = await extend({ endDate: '2027-01-20', dryRun: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2027-1/);
    expect(prismaMock.semester.update).not.toHaveBeenCalled();
  });
  it('semestre activo: trae el impacto en el déficit (antes / después) con el ledger', async () => {
    const active = { ...SEM, active: true };
    await mockLedgerDeps({ semester: active });
    prismaMock.semester.findUnique = vi.fn().mockResolvedValue(active);
    const res = await extend({ endDate: '2026-12-12' });
    expect(res.status).toBe(200);
    expect(res.body.data.impact).toEqual({
      before: { deficit: 0, studentsWithDeficit: 0, cubreCalendario: 0 },
      after: { deficit: 0, studentsWithDeficit: 0, cubreCalendario: 0 },
    });
  });
  it('semestre inexistente → 404', async () => {
    prismaMock.semester.findUnique.mockResolvedValueOnce(null);
    expect((await extend({ endDate: '2026-12-12' })).status).toBe(404);
  });
});

describe('PUT /semesters/:id con fechas', () => {
  it('no deja el fin antes del inicio ni encima del semestre siguiente', async () => {
    const put = (body) => request(app).put('/api/semesters/s2').set('Authorization', authAs('ADMIN')).send(body);
    expect((await put({ endDate: '2026-07-01' })).status).toBe(400);
    expect((await put({ endDate: '2027-02-01' })).status).toBe(400);
    expect((await put({ endDate: '2026-12-12' })).status).toBe(200);
  });
});
