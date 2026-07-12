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

const FAMILY = [
  { id: 's1', name: 'Ana Uno', document: '111', email: '', phone: '300', guardianName: 'Mamá', birthDate: null, enrollments: [] },
  { id: 's2', name: 'Beto Uno', document: '222', email: '', phone: '300', guardianName: 'Mamá', birthDate: null, enrollments: [] },
];

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const router = (await import('../../src/routes/validation.js')).default;
  // Público: el router aplica authMiddleware inline solo en /status.
  app = await buildApp('/api/validation', router, { withAuth: false });
});

beforeEach(() => {
  resetPrisma();
  prismaMock.student = {
    findFirst: vi.fn().mockResolvedValue(FAMILY[0]),          // el estudiante del documento
    findMany: vi.fn().mockResolvedValue(FAMILY),               // él + hermanos
    update: vi.fn().mockImplementation(({ where }) => Promise.resolve({ id: where.id })),
  };
});

describe('POST /api/validation/lookup', () => {
  it('devuelve la familia por documento del estudiante', async () => {
    const res = await request(app).post('/api/validation/lookup').send({ document: '111' });
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(true);
    expect(res.body.data.students.map((s) => s.id)).toEqual(['s1', 's2']);
    // nunca expone campos económicos
    expect(res.body.data.students[0]).not.toHaveProperty('paymentComplete');
  });

  it('found=false si no hay estudiante', async () => {
    prismaMock.student.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/validation/lookup').send({ document: '999' });
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(false);
  });
});

describe('POST /api/validation/submit', () => {
  it('exige aceptar políticas → 400', async () => {
    const res = await request(app).post('/api/validation/submit')
      .send({ document: '111', students: [], policiesAccepted: false });
    expect(res.status).toBe(400);
  });

  it('solo actualiza estudiantes de la familia (ignora ids ajenos)', async () => {
    const res = await request(app).post('/api/validation/submit').send({
      document: '111',
      students: [
        { id: 's1', email: 'a@a.co' },
        { id: 'INTRUSO', email: 'hack@x.co' }, // fuera de la familia
      ],
      policiesAccepted: true,
    });
    expect(res.status).toBe(200);
    const updatedIds = prismaMock.student.update.mock.calls.map((c) => c[0].where.id);
    expect(updatedIds).toContain('s1');
    expect(updatedIds).not.toContain('INTRUSO');
    // s2 (hermano no enviado) igual queda validado
    expect(updatedIds).toContain('s2');
  });
});

describe('GET /api/validation/status', () => {
  it('TEACHER → 403', async () => {
    prismaMock.student.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/validation/status')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(res.status).toBe(403);
  });

  it('RECEPTION → 200 con conteos', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      { id: 's1', name: 'Ana', document: '111', validatedAt: new Date(), policiesAcceptedAt: new Date(), enrollments: [] },
      { id: 's2', name: 'Beto', document: '222', validatedAt: null, policiesAcceptedAt: null, enrollments: [] },
    ]);
    const res = await request(app).get('/api/validation/status')
      .set('Authorization', `Bearer ${authAs('RECEPTION')}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 2, validated: 1, pending: 1 });
  });
});
