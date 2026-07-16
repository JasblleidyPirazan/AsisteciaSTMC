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
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'trial1', active: true, ...data })),
  };
  await mockStudentStatusDeps();
});

describe('POST /students/trial — clase de prueba', () => {
  it.each(['TEACHER', 'PHYSICAL_TRAINER', 'ADMIN', 'SUPERADMIN'])(
    '%s puede crear un estudiante de prueba (201, isTrial)', async (role) => {
      const res = await request(app).post('/api/students/trial')
        .set('Authorization', `Bearer ${authAs(role)}`)
        .send({ name: '  Valentina Prueba  ' });
      expect(res.status).toBe(201);
      const data = prismaMock.student.create.mock.calls[0][0].data;
      expect(data.isTrial).toBe(true);
      expect(data.name).toBe('Valentina Prueba'); // trim aplicado
      expect(data.classesStartDate).toBeInstanceOf(Date);
    }
  );

  it.each(['ASSISTANT', 'PARENT', 'RECEPTION'])('deniega a %s (403)', async (role) => {
    const res = await request(app).post('/api/students/trial')
      .set('Authorization', `Bearer ${authAs(role)}`)
      .send({ name: 'X' });
    expect(res.status).toBe(403);
    expect(prismaMock.student.create).not.toHaveBeenCalled();
  });

  it('exige nombre (400)', async () => {
    const res = await request(app).post('/api/students/trial')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(prismaMock.student.create).not.toHaveBeenCalled();
  });
});
