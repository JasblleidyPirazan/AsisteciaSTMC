// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

// GET /sessions/check debe resolver los nombres del asistente y del profesor
// dictante de cada ClassReport (ids sueltos, sin FK) para que el flujo de
// asistencia precargue el reporte propio al editar (bug: el asistente
// reportado aparecía como "Sin asistente" y se borraba al re-guardar).
let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

function sessionWith(reports) {
  return {
    id: 's1',
    groupId: 'g1',
    date: new Date('2026-07-20T00:00:00.000Z'),
    status: 'PROGRAMADA',
    attendanceRecords: [],
    substituteProfessor: null,
    assistant: null,
    reports,
  };
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  const sessionsRouter = (await import('../../src/routes/sessions.js')).default;
  app = await buildApp('/api/sessions', sessionsRouter);
});

beforeEach(() => {
  resetPrisma();
  prismaMock.assistant = { findMany: vi.fn().mockResolvedValue([{ id: 'a1', name: 'Asistente Uno' }]) };
  prismaMock.professor = { findMany: vi.fn().mockResolvedValue([{ id: 'p2', name: 'Profe Sustituto' }]) };
});

function check(token) {
  return request(app)
    .get('/api/sessions/check?groupId=g1&date=2026-07-20')
    .set('Authorization', `Bearer ${token}`);
}

describe('GET /api/sessions/check — resuelve asistente y dictante de los reportes', () => {
  it('adjunta assistant y dictatingProfessor con nombre a cada reporte', async () => {
    const token = authAs('TEACHER');
    prismaMock.classSession = {
      findUnique: vi.fn().mockResolvedValue(sessionWith([
        {
          id: 'r1', reporterType: 'PROFESSOR', dictatedByOwner: false,
          dictatingProfessorId: 'p2', assistantId: 'a1', attendance: [],
        },
      ])),
    };

    const res = await check(token);
    expect(res.status).toBe(200);
    const [report] = res.body.data.session.reports;
    expect(report.assistant).toEqual({ id: 'a1', name: 'Asistente Uno' });
    expect(report.dictatingProfessor).toEqual({ id: 'p2', name: 'Profe Sustituto' });
  });

  it('reporte sin asistente ni sustituto → null en ambos (y no consulta de más)', async () => {
    const token = authAs('TEACHER');
    prismaMock.classSession = {
      findUnique: vi.fn().mockResolvedValue(sessionWith([
        {
          id: 'r1', reporterType: 'PROFESSOR', dictatedByOwner: true,
          dictatingProfessorId: null, assistantId: null, attendance: [],
        },
      ])),
    };

    const res = await check(token);
    expect(res.status).toBe(200);
    const [report] = res.body.data.session.reports;
    expect(report.assistant).toBe(null);
    expect(report.dictatingProfessor).toBe(null);
    expect(prismaMock.assistant.findMany).not.toHaveBeenCalled();
    expect(prismaMock.professor.findMany).not.toHaveBeenCalled();
  });

  it('sin sesión → exists: false sin lookups extra', async () => {
    const token = authAs('TEACHER');
    prismaMock.classSession = { findUnique: vi.fn().mockResolvedValue(null) };

    const res = await check(token);
    expect(res.status).toBe(200);
    expect(res.body.data.exists).toBe(false);
    expect(prismaMock.assistant.findMany).not.toHaveBeenCalled();
  });
});
