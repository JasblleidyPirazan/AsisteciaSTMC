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

// Grupo con subnivel HISTÓRICO hoy inválido (Amarilla usaba A/B/C; ahora usa
// Principiante/Intermedio/Avanzado). Caso real: MJ1932 no dejaba cambiar el cupo.
const LEGACY_GROUP = {
  id: 'g1', code: 'MJ1932', ballLevel: 'Amarilla', subLevel: 'B',
  startTime: '19:30', endTime: '20:15', capacity: 8,
};

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const groupsRouter = (await import('../../src/routes/groups.js')).default;
  app = await buildApp('/api/groups', groupsRouter);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.group = {
    findUnique: vi.fn().mockResolvedValue(LEGACY_GROUP),
    update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...LEGACY_GROUP, ...data })),
  };
});

describe('PUT /groups/:id — edición con subnivel histórico', () => {
  it('permite cambiar el cupo aunque el subnivel guardado ya no sea válido (sin cambiarlo)', async () => {
    const res = await request(app).put('/api/groups/g1')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`)
      .send({ code: 'MJ1932', ballLevel: 'Amarilla', subLevel: 'B', capacity: 4, startTime: '19:30', endTime: '20:15' });

    expect(res.status).toBe(200);
    const data = prismaMock.group.update.mock.calls[0][0].data;
    expect(data.capacity).toBe(4);
    // Nivel/subnivel no cambiaron → no se tocan (se conserva el histórico)
    expect(data).not.toHaveProperty('subLevel');
  });

  it('sí valida cuando el subnivel CAMBIA a uno inválido (400)', async () => {
    const res = await request(app).put('/api/groups/g1')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`)
      .send({ ballLevel: 'Amarilla', subLevel: 'C', capacity: 4 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Subnivel inválido/);
    expect(prismaMock.group.update).not.toHaveBeenCalled();
  });

  it('permite corregir el subnivel a uno válido del catálogo actual', async () => {
    const res = await request(app).put('/api/groups/g1')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`)
      .send({ ballLevel: 'Amarilla', subLevel: 'Intermedio', capacity: 4 });

    expect(res.status).toBe(200);
    const data = prismaMock.group.update.mock.calls[0][0].data;
    expect(data.subLevel).toBe('Intermedio');
    expect(data.capacity).toBe(4);
  });

  it('al cambiar de nivel exige un subnivel coherente (400 si queda el viejo)', async () => {
    const res = await request(app).put('/api/groups/g1')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`)
      .send({ ballLevel: 'Verde', subLevel: 'Intermedio' });

    expect(res.status).toBe(400);
  });
});
