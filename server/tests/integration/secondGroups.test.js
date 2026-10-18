// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma, mockStudentStatusDeps } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import XLSX from 'xlsx';
import { JWT_SECRET, tokenFor, buildApp } from '../helpers/testApp.js';

let app;

function authAs(role, id = 'u1') {
  prismaMock.user = {
    findUnique: vi.fn().mockResolvedValue({ id, email: `${role}@stmc.co`, role, active: true }),
  };
  return tokenFor({ id, role });
}

const G1 = { code: 'MJ1933', professor: { name: 'Ricardo' } };
const G2 = { code: 'MJ1724', professor: { name: 'Wilman' } };

const STUDENTS = [{
  id: 's1', name: 'Maria Paz Brieva', document: '1001', active: true, isTrial: false, birthDate: null,
  classesAcquired: 20, classesStartDate: null, suspendedFrom: null, suspendedUntil: null,
  enrollments: [{ groupId: 'g1', enrollmentType: 'PRIMARY', enrolledAt: new Date('2026-08-01'), group: G1 }],
}];

const visit = (date) => ({
  studentId: 's1', status: 'PRESENTE', attendanceType: 'REPOSICION',
  session: { date: new Date(`${date}T00:00:00Z`), kind: 'REGULAR', groupId: 'g2', group: G2 },
});
const RECORDS = [visit('2026-10-13'), visit('2026-10-15'), visit('2026-10-20')];

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/reports', (await import('../../src/routes/reports.js')).default);
});

beforeEach(async () => {
  resetPrisma();
  prismaMock.semester = { findFirst: vi.fn().mockResolvedValue(null) };
  prismaMock.student = { findMany: vi.fn().mockResolvedValue(STUDENTS) };
  prismaMock.attendanceRecord = { findMany: vi.fn().mockResolvedValue(RECORDS) };
  await mockStudentStatusDeps();
});

describe('GET /api/reports/second-groups', () => {
  it('TEACHER → 403', async () => {
    const token = authAs('TEACHER');
    const res = await request(app).get('/api/reports/second-groups').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('Coordinador ve a quién asiste a otro grupo, desde cuándo y sin montos', async () => {
    const token = authAs('PHYSICAL_TRAINER');
    const res = await request(app).get('/api/reports/second-groups').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const [row] = res.body.data.rows;
    expect(row).toMatchObject({
      name: 'Maria Paz Brieva', mainGroupCode: 'MJ1933', groupCode: 'MJ1724',
      visits: 3, weeks: 2, firstDate: '2026-10-13', enrolled: false,
    });
    expect(row.tuition).toBeUndefined();
    // Solo PRESENTE de clases regulares con grupo
    const where = prismaMock.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'PRESENTE', session: { kind: 'REGULAR' } });
  });

  it('rango from/to se pasa a la consulta', async () => {
    const token = authAs('ADMIN');
    await request(app).get('/api/reports/second-groups?from=2026-10-01&to=2026-10-31').set('Authorization', `Bearer ${token}`);
    const where = prismaMock.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(where.session.date.gte).toEqual(new Date('2026-10-01'));
    expect(where.session.date.lte).toEqual(new Date('2026-10-31'));
  });

  it('export Excel marca "Regular" según el umbral pedido', async () => {
    const token = authAs('ADMIN');
    const res = await request(app).get('/api/reports/second-groups/export?minVisits=4')
      .set('Authorization', `Bearer ${token}`).buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(res.status).toBe(200);
    const rows = XLSX.utils.sheet_to_json(XLSX.read(res.body).Sheets['Otros grupos']);
    expect(rows[0]).toMatchObject({ Estudiante: 'Maria Paz Brieva', 'Otro grupo': 'MJ1724', Veces: 3, Regular: 'No' });
  });
});
