// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma, mockStudentStatusDeps } from '../helpers/mockPrisma.js';
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
  const studentsRouter = (await import('../../src/routes/students.js')).default;
  app = await buildApp('/api/students', studentsRouter);
});

beforeEach(async () => {
  resetPrisma();
  prismaMock.student = {
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'st1', active: true, enrollments: [], ...data })),
  };
  prismaMock.studentGroupHistory = { create: vi.fn().mockResolvedValue({}) };
  await mockStudentStatusDeps();
});

describe('POST /students — creación sin grupo y campos numéricos vacíos', () => {
  it('crea el estudiante SIN grupo y con "Clases adquiridas" vacío → 0 (no NaN)', async () => {
    const res = await request(app).post('/api/students')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`)
      .send({ name: 'Emilio Herron', document: '1034995720', classesAcquired: '', birthDate: '2012-05-10' });

    expect(res.status).toBe(201);
    const data = prismaMock.student.create.mock.calls[0][0].data;
    expect(data.classesAcquired).toBe(0);              // antes daba NaN → 500
    expect(Number.isNaN(data.classesAcquired)).toBe(false);
    // Sin grupo: no se crea ninguna matrícula
    expect(data.enrollments.create).toEqual([]);
  });

  it('respeta un valor numérico válido de clases adquiridas', async () => {
    const res = await request(app).post('/api/students')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`)
      .send({ name: 'Ana', classesAcquired: '40', birthDate: '1990-01-01' });
    expect(res.status).toBe(201);
    expect(prismaMock.student.create.mock.calls[0][0].data.classesAcquired).toBe(40);
  });

  it('exige el nombre (400)', async () => {
    const res = await request(app).post('/api/students')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`)
      .send({ classesAcquired: '10', birthDate: '2012-05-10' });
    expect(res.status).toBe(400);
  });

  it('exige la fecha de nacimiento (400) — define la tarifa adulto/pequeño', async () => {
    const res = await request(app).post('/api/students')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`)
      .send({ name: 'Sin Fecha', classesAcquired: '10' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nacimiento/i);
    expect(prismaMock.student.create).not.toHaveBeenCalled();
  });
});
