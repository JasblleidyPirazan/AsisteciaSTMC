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
  const router = (await import('../../src/routes/search.js')).default;
  app = await buildApp('/api/search', router);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.student = { findMany: vi.fn().mockResolvedValue([]) };
  prismaMock.group = { findMany: vi.fn().mockResolvedValue([]) };
});

describe('GET /search — buscador global', () => {
  it.each(['TEACHER', 'ASSISTANT', 'PARENT'])('deniega a %s (403)', async (role) => {
    const res = await request(app).get('/api/search?q=ana').set('Authorization', `Bearer ${authAs(role)}`);
    expect(res.status).toBe(403);
  });

  it('con menos de 2 caracteres no consulta la BD y devuelve vacío', async () => {
    const res = await request(app).get('/api/search?q=a').set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ students: [], groups: [] });
    expect(prismaMock.student.findMany).not.toHaveBeenCalled();
  });

  it('devuelve estudiantes (con grupo principal) y grupos ordenados', async () => {
    const token = authAs('RECEPTION');
    prismaMock.student.findMany.mockResolvedValue([
      { id: 's1', name: 'Ana Ruiz', document: '123', isTrial: false,
        enrollments: [{ enrollmentType: 'PRIMARY', group: { code: 'MJ1' } }] },
    ]);
    prismaMock.group.findMany.mockResolvedValue([
      { id: 'g2', code: 'MJ10', ballLevel: 'Verde', subLevel: 'A', professor: { name: 'Ana' } },
      { id: 'g1', code: 'MJ2', ballLevel: 'Roja', subLevel: null, professor: { name: 'Luis' } },
    ]);

    const res = await request(app).get('/api/search?q=ana').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.students[0]).toMatchObject({ id: 's1', name: 'Ana Ruiz', groupCode: 'MJ1' });
    // Orden alfanumérico natural: MJ2 antes que MJ10
    expect(res.body.data.groups.map((g) => g.code)).toEqual(['MJ2', 'MJ10']);
  });
});
