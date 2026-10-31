// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;
function authAs(role) {
  prismaMock.user = { findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co', role, active: true }) };
  return `Bearer ${tokenFor({ id: 'u1', role })}`;
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/config', (await import('../../src/routes/config.js')).default);
});
beforeEach(() => {
  resetPrisma();
  prismaMock.systemConfig = {
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve(create)),
  };
});

describe('PUT /config — reglas de agendamiento de reposiciones', () => {
  it('GET devuelve los valores por defecto de turnos y cupo', async () => {
    const res = await request(app).get('/api/config').set('Authorization', authAs('ADMIN'));
    expect(res.body.data.makeup_capacity).toBe('6');
    expect(JSON.parse(res.body.data.makeup_slots)).toHaveLength(4);
  });

  it('guarda turnos válidos normalizados', async () => {
    const slots = [{ weekday: 6, start: '10:00', end: '10:45', key: 'ignorada' }];
    const res = await request(app).put('/api/config').set('Authorization', authAs('ADMIN'))
      .send({ makeup_slots: JSON.stringify(slots), makeup_capacity: 5 });
    expect(res.status).toBe(200);
    const saved = prismaMock.systemConfig.upsert.mock.calls.find((c) => c[0].where.key === 'makeup_slots')[0].create.value;
    expect(JSON.parse(saved)).toEqual([{ weekday: 6, start: '10:00', end: '10:45' }]);
  });

  it('rechaza turnos o números fuera de rango (400) sin guardar nada', async () => {
    const bad1 = await request(app).put('/api/config').set('Authorization', authAs('ADMIN'))
      .send({ makeup_slots: JSON.stringify([{ weekday: 2, start: '11:00', end: '10:00' }]) });
    const bad2 = await request(app).put('/api/config').set('Authorization', authAs('ADMIN')).send({ makeup_capacity: 0 });
    expect(bad1.status).toBe(400);
    expect(bad2.status).toBe(400);
    expect(prismaMock.systemConfig.upsert).not.toHaveBeenCalled();
  });

  it('solo ADMIN puede cambiarlas', async () => {
    const res = await request(app).put('/api/config').set('Authorization', authAs('PHYSICAL_TRAINER')).send({ makeup_capacity: 4 });
    expect(res.status).toBe(403);
  });
});
