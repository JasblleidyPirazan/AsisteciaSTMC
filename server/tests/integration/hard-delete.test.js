// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let studentsApp, groupsApp, systemApp;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

const deleteMany = () => vi.fn().mockResolvedValue({ count: 0 });
const updateMany = () => vi.fn().mockResolvedValue({ count: 0 });

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  studentsApp = await buildApp('/api/students', (await import('../../src/routes/students.js')).default);
  groupsApp = await buildApp('/api/groups', (await import('../../src/routes/groups.js')).default);
  systemApp = await buildApp('/api/system', (await import('../../src/routes/system.js')).default);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.$transaction = vi.fn((ops) => Promise.all(ops));
});

describe('DELETE /api/students/:id/permanent', () => {
  beforeEach(() => {
    prismaMock.student = {
      findUnique: vi.fn().mockResolvedValue({ id: 's1', name: 'Test' }),
      delete: vi.fn().mockResolvedValue({ id: 's1' }),
    };
    for (const m of ['classReportAttendance', 'attendanceRecord', 'studentPayment', 'makeupParticipant', 'makeupEnrollment', 'studentGroupHistory', 'studentEnrollment']) {
      prismaMock[m] = { deleteMany: deleteMany() };
    }
  });

  it('PHYSICAL_TRAINER (Coordinador) → 403', async () => {
    const res = await request(studentsApp).delete('/api/students/s1/permanent')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`).send({ confirm: true });
    expect(res.status).toBe(403);
  });

  it('ADMIN sin confirm → 400', async () => {
    const res = await request(studentsApp).delete('/api/students/s1/permanent')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`).send({});
    expect(res.status).toBe(400);
  });

  it('ADMIN con confirm → 200 y borra en transacción', async () => {
    const res = await request(studentsApp).delete('/api/students/s1/permanent')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`).send({ confirm: true });
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.student.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });
});

describe('DELETE /api/groups/:id/permanent', () => {
  beforeEach(() => {
    prismaMock.group = {
      findUnique: vi.fn().mockResolvedValue({ id: 'g1', code: 'T1' }),
      delete: vi.fn().mockResolvedValue({ id: 'g1' }),
    };
    prismaMock.classSession = { findMany: vi.fn().mockResolvedValue([{ id: 'sess1' }]), deleteMany: deleteMany() };
    prismaMock.classReport = { findMany: vi.fn().mockResolvedValue([{ id: 'r1' }]), deleteMany: deleteMany() };
    for (const m of ['classReportAttendance', 'attendanceRecord', 'costRecord', 'sessionEditLog', 'makeupParticipant', 'studentEnrollment']) {
      prismaMock[m] = { deleteMany: deleteMany() };
    }
    prismaMock.studentGroupHistory = { updateMany: updateMany() };
  });

  it('SUPERADMIN con confirm → 200', async () => {
    const res = await request(groupsApp).delete('/api/groups/g1/permanent')
      .set('Authorization', `Bearer ${authAs('SUPERADMIN')}`).send({ confirm: true });
    expect(res.status).toBe(200);
    expect(prismaMock.group.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });

  it('PHYSICAL_TRAINER → 403', async () => {
    const res = await request(groupsApp).delete('/api/groups/g1/permanent')
      .set('Authorization', `Bearer ${authAs('PHYSICAL_TRAINER')}`).send({ confirm: true });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/system/wipe-classes', () => {
  beforeEach(() => {
    for (const m of ['classReportAttendance', 'classReport', 'attendanceRecord', 'costRecord', 'sessionEditLog', 'festivalProfessor', 'makeupParticipant', 'payrollApproval', 'classSession']) {
      prismaMock[m] = { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) };
    }
  });

  it('ADMIN → 403 (solo SUPERADMIN)', async () => {
    const res = await request(systemApp).post('/api/system/wipe-classes')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`).send({ confirm: 'BORRAR CLASES' });
    expect(res.status).toBe(403);
  });

  it('SUPERADMIN sin confirmación correcta → 400', async () => {
    const res = await request(systemApp).post('/api/system/wipe-classes')
      .set('Authorization', `Bearer ${authAs('SUPERADMIN')}`).send({ confirm: 'si' });
    expect(res.status).toBe(400);
  });

  it('SUPERADMIN con confirmación → 200 y suma el total', async () => {
    const res = await request(systemApp).post('/api/system/wipe-classes')
      .set('Authorization', `Bearer ${authAs('SUPERADMIN')}`).send({ confirm: 'BORRAR CLASES' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(18); // 9 modelos × 2
  });
});
