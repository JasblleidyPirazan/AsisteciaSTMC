// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Una reposición grupal la reporta el PROFESOR y la confirma el ASISTENTE. Que
// el coordinador la haya reportado no reemplaza ninguna de las dos cosas, así
// que el home del profesor pide TODAS sus reposiciones (no solo las
// PROGRAMADA) y decide en el cliente cuáles le faltan.

let app;
function authAs(role, id = 'u1') {
  prismaMock.user = { findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }) };
  return tokenFor({ id, role });
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const r = (await import('../../src/routes/makeups.js')).default;
  app = await buildApp('/api/makeups', r);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.professor = { findUnique: vi.fn().mockResolvedValue({ id: 'prof1', name: 'Harold' }) };
  prismaMock.classSession = { findMany: vi.fn().mockResolvedValue([]) };
});

describe('GET /makeups — datos para saber qué falta de una reposición', () => {
  it('devuelve quién la reportó y si el asistente confirmó', async () => {
    await request(app).get('/api/makeups')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);

    const include = prismaMock.classSession.findMany.mock.calls[0][0].include;
    expect(include.reportedBy.select).toMatchObject({ id: true, role: true });
    expect(include.assistantConfirmed.select).toMatchObject({ id: true, name: true });
  });

  it('sin filtro de estado devuelve también las ya reportadas (REALIZADA)', async () => {
    // El home del profesor ya no manda status: si el coordinador la reportó,
    // el profesor debe seguir viéndola para poner su propio reporte.
    await request(app).get('/api/makeups')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);

    const where = prismaMock.classSession.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
    expect(where.kind).toBe('MAKEUP');
    expect(where.OR).toEqual([
      { makeupProfessorId: 'prof1' },
      { substituteProfessorId: 'prof1' },
    ]);
  });

  it('al asistente no se le manda quién reportó', async () => {
    prismaMock.assistant = { findUnique: vi.fn().mockResolvedValue({ id: 'a1' }) };
    prismaMock.classSession.findMany = vi.fn().mockResolvedValue([{
      id: 'm1', status: 'REALIZADA', reportedById: 'u9',
      reportedBy: { id: 'u9', email: 'coord@stmc.co', role: 'PHYSICAL_TRAINER' },
      makeupParticipants: [{ id: 'p1', studentId: 's1', student: { id: 's1', name: 'Ana' } }],
      attendanceRecords: [],
    }]);

    const res = await request(app).get('/api/makeups')
      .set('Authorization', `Bearer ${authAs('ASSISTANT', 'u2')}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].reportedBy).toBeUndefined();
  });
});
