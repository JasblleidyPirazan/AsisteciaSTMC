// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;
const KEY = 'k'.repeat(32);

function authAs(role) {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: `${role}@stmc.co`, role, active: true }),
  };
  return `Bearer ${tokenFor({ id: 'u1', role })}`;
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/notifications', (await import('../../src/routes/notifications.js')).default, { withAuth: false });
});

beforeEach(() => {
  resetPrisma();
  prismaMock.semester = { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) };
  process.env.NOTIFY_API_KEY = KEY;
});
afterEach(() => { delete process.env.NOTIFY_API_KEY; });

describe('vista previa', () => {
  it('exige login de ADMIN o Coordinador', async () => {
    expect((await request(app).get('/api/notifications/weekly-progress')).status).toBe(401);
    expect((await request(app).get('/api/notifications/weekly-progress').set('Authorization', authAs('TEACHER'))).status).toBe(403);
    expect((await request(app).get('/api/notifications/weekly-progress').set('Authorization', authAs('RECEPTION'))).status).toBe(403);
    const ok = await request(app).get('/api/notifications/weekly-progress').set('Authorization', authAs('PHYSICAL_TRAINER'));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ recipients: [], skipped: [], feedEnabled: true });
  });
});

describe('feed para el script de envío', () => {
  it('sin NOTIFY_API_KEY configurada está apagado (503)', async () => {
    delete process.env.NOTIFY_API_KEY;
    expect((await request(app).get('/api/notifications/weekly-progress/feed').set('X-Api-Key', KEY)).status).toBe(503);
  });
  it('rechaza una clave ausente o equivocada', async () => {
    expect((await request(app).get('/api/notifications/weekly-progress/feed')).status).toBe(401);
    expect((await request(app).get('/api/notifications/weekly-progress/feed').set('X-Api-Key', 'otra')).status).toBe(401);
    expect(prismaMock.semester.findFirst).not.toHaveBeenCalled();
  });
  it('con la clave correcta devuelve los correos', async () => {
    const res = await request(app).get('/api/notifications/weekly-progress/feed').set('X-Api-Key', KEY);
    expect(res.status).toBe(200);
    expect(res.body.data.recipients).toEqual([]);
  });
});
