// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// Agendamiento público de reposiciones: guardas del enlace y de la coordinación.
// El flujo completo (reservar, cupo, cancelar) se validó contra Postgres real.
let app;
const TOKEN = 'a'.repeat(24);
const STUDENT = { id: 'st1', name: 'Ana', active: true, bookingToken: TOKEN, enrollments: [] };

function authAs(role) {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id: 'u1', role });
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/makeup-booking', (await import('../../src/routes/makeupBooking.js')).default, { withAuth: false });
});

beforeEach(() => {
  resetPrisma();
  prismaMock.student = { findUnique: vi.fn().mockResolvedValue(STUDENT) };
  prismaMock.systemConfig = { findMany: vi.fn().mockResolvedValue([]) }; // reglas de agendamiento por defecto
});

describe('enlace público', () => {
  it('un código inexistente o de un estudiante inactivo es 404', async () => {
    prismaMock.student.findUnique.mockResolvedValueOnce(null);
    expect((await request(app).get(`/api/makeup-booking/${TOKEN}`)).status).toBe(404);
    prismaMock.student.findUnique.mockResolvedValueOnce({ ...STUDENT, active: false });
    expect((await request(app).get(`/api/makeup-booking/${TOKEN}`)).status).toBe(404);
  });

  it('un código demasiado corto ni siquiera consulta la base', async () => {
    const res = await request(app).get('/api/makeup-booking/abc');
    expect(res.status).toBe(404);
    expect(prismaMock.student.findUnique).not.toHaveBeenCalled();
  });

  it('no se puede reservar un turno que no existe', async () => {
    prismaMock.semester = { findFirst: vi.fn().mockResolvedValue(null) };
    const res = await request(app).post(`/api/makeup-booking/${TOKEN}/book`).send({ date: '2026-10-21', slotKey: 'VIE-1715' });
    expect(res.status).toBe(400);
  });

  it('una reposición programada por la Escuela no la cancela el acudiente', async () => {
    prismaMock.makeupParticipant = {
      findUnique: vi.fn().mockResolvedValue({
        sessionId: 's1', studentId: 'st1', bookedAt: null,
        session: { id: 's1', kind: 'MAKEUP', status: 'PROGRAMADA', bookingSlot: null, date: new Date('2026-12-04T00:00:00Z') },
      }),
      delete: vi.fn(),
    };
    const res = await request(app).delete(`/api/makeup-booking/${TOKEN}/book/s1`);
    expect(res.status).toBe(403);
    expect(prismaMock.makeupParticipant.delete).not.toHaveBeenCalled();
  });

  it('la sugerencia exige texto', async () => {
    const res = await request(app).post(`/api/makeup-booking/${TOKEN}/suggestions`).send({ text: ' ' });
    expect(res.status).toBe(400);
  });
});

describe('coordinación', () => {
  it('la agenda exige sesión de ADMIN o Coordinador', async () => {
    expect((await request(app).get('/api/makeup-booking/admin/overview')).status).toBe(401);
    const teacher = authAs('TEACHER');
    const res = await request(app).get('/api/makeup-booking/admin/overview').set('Authorization', `Bearer ${teacher}`);
    expect(res.status).toBe(403);
  });

  it('crear el enlace genera un código y lo reutiliza después', async () => {
    const token = authAs('PHYSICAL_TRAINER');
    prismaMock.student.findUnique.mockResolvedValueOnce({ ...STUDENT, bookingToken: null });
    prismaMock.student.update = vi.fn().mockResolvedValue({});
    const first = await request(app).post('/api/makeup-booking/admin/students/st1/link').set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.data.token.length).toBeGreaterThanOrEqual(24);
    expect(prismaMock.student.update).toHaveBeenCalledTimes(1);

    const again = await request(app).post('/api/makeup-booking/admin/students/st1/link').set('Authorization', `Bearer ${token}`);
    expect(again.body.data.token).toBe(TOKEN);
    expect(prismaMock.student.update).toHaveBeenCalledTimes(1);
  });
});
