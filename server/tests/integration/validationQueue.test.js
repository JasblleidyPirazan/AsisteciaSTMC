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

// Sesión base REGULAR con asistente reportado y confirmado, consolidada.
function sess(over = {}) {
  return {
    id: 's1', date: new Date('2026-07-10T00:00:00.000Z'), kind: 'REGULAR', title: null,
    consolidationStatus: 'MATCHED',
    assistantId: 'a1', assistantConfirmedId: 'a1', coordinatorValidatedAt: null,
    dictatedByOwner: true, notDictatedNote: null,
    group: { id: 'g1', code: 'MJ1', professor: { id: 'p1', name: 'Ana' } },
    makeupProfessor: null, substituteProfessor: null,
    assistant: { id: 'a1', name: 'Emi' }, assistantConfirmed: { id: 'a1', name: 'Emi' },
    ...over,
  };
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const router = (await import('../../src/routes/sessions.js')).default;
  app = await buildApp('/api/sessions', router);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.classSession = { findMany: vi.fn() };
});

async function fetchQueue(role = 'PHYSICAL_TRAINER') {
  const token = authAs(role);
  const res = await request(app).get('/api/sessions/validation-queue?date=2026-07-10')
    .set('Authorization', `Bearer ${token}`);
  return res;
}

describe('GET /sessions/validation-queue — qué reporte falta (triple coincidencia)', () => {
  it('todo coincide (REGULAR MATCHED + confirmado) → complete, sin faltantes', async () => {
    prismaMock.classSession.findMany.mockResolvedValue([sess()]);
    const res = await fetchQueue();
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ complete: true, autoValidated: true, missing: [] });
  });

  it('falta la confirmación del asistente', async () => {
    prismaMock.classSession.findMany.mockResolvedValue([sess({ assistantConfirmedId: null, assistantConfirmed: null })]);
    const res = await fetchQueue();
    expect(res.body.data[0].complete).toBe(false);
    expect(res.body.data[0].missing).toEqual(['assistant']);
  });

  it('el asistente confirmado no coincide con el reportado', async () => {
    prismaMock.classSession.findMany.mockResolvedValue([sess({ assistantConfirmedId: 'a2', assistantConfirmed: { id: 'a2', name: 'Otro' } })]);
    const res = await fetchQueue();
    expect(res.body.data[0].missing).toEqual(['assistant_mismatch']);
  });

  it('el profesor no reportó asistente (solo el asistente se autoconfirmó)', async () => {
    prismaMock.classSession.findMany.mockResolvedValue([sess({ assistantId: null, assistant: null })]);
    const res = await fetchQueue();
    expect(res.body.data[0].missing).toContain('professor');
  });

  it('falta la validación/coincidencia del coordinador (reposición sin validar)', async () => {
    prismaMock.classSession.findMany.mockResolvedValue([
      sess({ kind: 'MAKEUP', consolidationStatus: 'PENDING', coordinatorValidatedAt: null }),
    ]);
    const res = await fetchQueue();
    expect(res.body.data[0].missing).toEqual(['coordinator']);
    expect(res.body.data[0].complete).toBe(false);
  });
});
