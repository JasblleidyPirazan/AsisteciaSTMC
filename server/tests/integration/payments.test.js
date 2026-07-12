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

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const studentsRouter = (await import('../../src/routes/students.js')).default;
  app = await buildApp('/api/students', studentsRouter);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.student = { findUnique: vi.fn().mockResolvedValue({ id: 's1' }) };
  prismaMock.studentPayment = {
    findMany: vi.fn().mockResolvedValue([
      { id: 'pay1', amount: '120000', method: 'TRANSFERENCIA', paymentDate: new Date('2025-06-10'), receivedByName: 'recep@stmc.co' },
    ]),
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pay2', ...data })),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
});

describe('Registro de pagos del estudiante', () => {
  it('RECEPTION crea un pago y captura al usuario logueado como receptor', async () => {
    const res = await request(app).post('/api/students/s1/payments')
      .set('Authorization', `Bearer ${authAs('RECEPTION')}`)
      .send({ paymentDate: '2025-06-15', method: 'EFECTIVO', amount: 90000 });
    expect(res.status).toBe(201);
    const data = prismaMock.studentPayment.create.mock.calls[0][0].data;
    expect(data.receivedById).toBe('u1');
    expect(data.receivedByName).toBe('RECEPTION@stmc.co');
    expect(data.amount).toBe(90000);
  });

  it('rechaza un medio de pago inválido (400)', async () => {
    const res = await request(app).post('/api/students/s1/payments')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`)
      .send({ paymentDate: '2025-06-15', method: 'CRIPTO', amount: 90000 });
    expect(res.status).toBe(400);
  });

  it('rechaza un valor no positivo (400)', async () => {
    const res = await request(app).post('/api/students/s1/payments')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`)
      .send({ paymentDate: '2025-06-15', method: 'BOLD', amount: 0 });
    expect(res.status).toBe(400);
  });

  it('TEACHER no puede ver ni crear pagos (403)', async () => {
    const list = await request(app).get('/api/students/s1/payments')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`);
    expect(list.status).toBe(403);
    const create = await request(app).post('/api/students/s1/payments')
      .set('Authorization', `Bearer ${authAs('TEACHER')}`)
      .send({ paymentDate: '2025-06-15', method: 'BOLD', amount: 1000 });
    expect(create.status).toBe(403);
  });

  it('GET devuelve el total agregado', async () => {
    const res = await request(app).get('/api/students/s1/payments')
      .set('Authorization', `Bearer ${authAs('RECEPTION')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(120000);
    expect(res.body.data.count).toBe(1);
  });

  it('RECEPTION no puede eliminar pagos; ADMIN sí', async () => {
    const recep = await request(app).delete('/api/students/s1/payments/pay1')
      .set('Authorization', `Bearer ${authAs('RECEPTION')}`);
    expect(recep.status).toBe(403);
    const admin = await request(app).delete('/api/students/s1/payments/pay1')
      .set('Authorization', `Bearer ${authAs('ADMIN')}`);
    expect(admin.status).toBe(200);
  });
});
