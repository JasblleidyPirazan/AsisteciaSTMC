// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma, mockStudentStatusDeps } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Días que el estudiante toma en cada grupo (StudentEnrollment.weekdays)
let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

const LMV = { id: 'g1', code: 'LMV1', lunes: true, miercoles: true, viernes: true };
const MJ = { id: 'g2', code: 'MJ1', martes: true, jueves: true };

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/students', (await import('../../src/routes/students.js')).default);
});

beforeEach(async () => {
  resetPrisma();
  prismaMock.student = {
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'st1', active: true, enrollments: [], ...data })),
    findUnique: vi.fn().mockResolvedValue({ id: 'st1', enrollments: [], groupHistory: [] }),
  };
  prismaMock.group = {
    findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve({ g1: LMV, g2: MJ }[where.id] || null)),
  };
  prismaMock.studentEnrollment = {
    upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve(create)),
    findUnique: vi.fn().mockResolvedValue({ studentId: 'st1', groupId: 'g1', weekdays: [] }),
    update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ studentId: 'st1', groupId: 'g1', ...data })),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  prismaMock.studentGroupHistory = { create: vi.fn().mockResolvedValue({}) };
  await mockStudentStatusDeps();
});

const post = (path, body, role = 'ADMIN') =>
  request(app).post(`/api/students${path}`).set('Authorization', `Bearer ${authAs(role)}`).send(body);
const patch = (path, body, role = 'ADMIN') =>
  request(app).patch(`/api/students${path}`).set('Authorization', `Bearer ${authAs(role)}`).send(body);

describe('POST /students — días por grupo', () => {
  const base = { name: 'Ana', birthDate: '2012-05-10', classesAcquired: 40 };

  it('guarda los días del grupo principal y del secundario', async () => {
    const res = await post('', { ...base, primaryGroupId: 'g1', primaryWeekdays: [5, 1], secondaryGroupId: 'g2', secondaryWeekdays: [4] });
    expect(res.status).toBe(201);
    const { create } = prismaMock.student.create.mock.calls[0][0].data.enrollments;
    expect(create).toEqual([
      { groupId: 'g1', enrollmentType: 'PRIMARY', weekdays: [1, 5] },
      { groupId: 'g2', enrollmentType: 'SECONDARY', weekdays: [4] },
    ]);
  });

  it('sin días (o con todos los del grupo) guarda "todos" (lista vacía = null)', async () => {
    await post('', { ...base, primaryGroupId: 'g1' });
    await post('', { ...base, primaryGroupId: 'g1', primaryWeekdays: [1, 3, 5] });
    for (const call of prismaMock.student.create.mock.calls) {
      expect(call[0].data.enrollments.create[0].weekdays).toEqual([]);
    }
  });

  it('rechaza (400) un día que el grupo no tiene y no crea nada', async () => {
    const res = await post('', { ...base, primaryGroupId: 'g1', primaryWeekdays: [2] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/martes/);
    expect(prismaMock.student.create).not.toHaveBeenCalled();
  });

  it('rechaza (400) días inválidos y (404) grupo inexistente', async () => {
    expect((await post('', { ...base, primaryGroupId: 'g1', primaryWeekdays: [9] })).status).toBe(400);
    expect((await post('', { ...base, primaryGroupId: 'g1', primaryWeekdays: 'lunes' })).status).toBe(400);
    expect((await post('', { ...base, primaryGroupId: 'nope', primaryWeekdays: [1] })).status).toBe(404);
  });
});

describe('POST /students/:id/transfer — días en el grupo destino', () => {
  it('guarda los días y los valida contra el grupo destino antes de mover', async () => {
    const ok = await post('/st1/transfer', { toGroupId: 'g1', weekdays: [3] });
    expect(ok.status).toBe(200);
    expect(prismaMock.studentEnrollment.upsert.mock.calls[0][0].create.weekdays).toEqual([3]);

    prismaMock.studentEnrollment.deleteMany.mockClear();
    const bad = await post('/st1/transfer', { toGroupId: 'g2', weekdays: [1] });
    expect(bad.status).toBe(400);
    expect(prismaMock.studentEnrollment.deleteMany).not.toHaveBeenCalled(); // no movió nada
  });
});

describe('POST /students/:id/enrollments — días en el grupo adicional', () => {
  it('guarda los días y rechaza los que el grupo no tiene', async () => {
    const ok = await post('/st1/enrollments', { groupId: 'g2', weekdays: [2] });
    expect(ok.status).toBe(200);
    expect(prismaMock.studentEnrollment.upsert.mock.calls[0][0].create.weekdays).toEqual([2]);
    expect((await post('/st1/enrollments', { groupId: 'g2', weekdays: [1] })).status).toBe(400);
  });

  it('sin días → todos los días del grupo', async () => {
    await post('/st1/enrollments', { groupId: 'g2' });
    expect(prismaMock.studentEnrollment.upsert.mock.calls[0][0].create.weekdays).toEqual([]);
  });
});

describe('PATCH /students/:id/enrollments/:groupId — editar días', () => {
  it('cambia los días de una matrícula existente; null = todos', async () => {
    const ok = await patch('/st1/enrollments/g1', { weekdays: [1, 3] });
    expect(ok.status).toBe(200);
    expect(prismaMock.studentEnrollment.update.mock.calls[0][0].data).toEqual({ weekdays: [1, 3] });

    await patch('/st1/enrollments/g1', { weekdays: null });
    expect(prismaMock.studentEnrollment.update.mock.calls[1][0].data).toEqual({ weekdays: [] });
  });

  it('valida: 400 sin weekdays, 400 día ajeno al grupo, 404 si no está en el grupo', async () => {
    expect((await patch('/st1/enrollments/g1', {})).status).toBe(400);
    expect((await patch('/st1/enrollments/g1', { weekdays: [2] })).status).toBe(400);
    prismaMock.studentEnrollment.findUnique.mockResolvedValue(null);
    expect((await patch('/st1/enrollments/g1', { weekdays: [1] })).status).toBe(404);
  });

  it('solo ADMIN, SUPERADMIN y Coordinador (Recepción no puede cambiar grupos)', async () => {
    expect((await patch('/st1/enrollments/g1', { weekdays: [1] }, 'RECEPTION')).status).toBe(403);
    expect((await patch('/st1/enrollments/g1', { weekdays: [1] }, 'PHYSICAL_TRAINER')).status).toBe(200);
  });
});
