// mockPrisma MUST be imported before the router (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
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

function fileB64(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Fecha', 'Grupo', 'Estudiante', 'Marca', 'Detalle', 'Profesor', 'Asistente'], ...rows,
  ]), 'asistencia');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }).toString('base64');
}

const ROWS = [
  ['2026-10-13', 'MJ1524', 'María del Mar Cardona', 'P', null, 'Wilman Jimenez', 'Santiago Mera'],
  ['2026-10-13', 'MJ1524', 'Rafael Rivera', 'A', null, null, null],
];

// Catálogo + estado de la clase. `existing` = sesión ya presente en la BD.
function mockCatalog({ existing = null } = {}) {
  prismaMock.group = {
    findMany: vi.fn().mockResolvedValue([{ id: 'g1', code: 'MJ1524', professorId: 'p1', professor: { name: 'Wilman Jimenez' } }]),
  };
  prismaMock.professor = { findMany: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Wilman Jimenez', active: true }]) };
  prismaMock.assistant = { findMany: vi.fn().mockResolvedValue([{ id: 'a1', name: 'Santiago Mera', active: true }]) };
  prismaMock.student = {
    findMany: vi.fn().mockResolvedValue([
      { id: 's1', name: 'Maria Del Mar Cardona', active: true, enrollments: [{ groupId: 'g1' }] },
      { id: 's2', name: 'Rafael Rivera', active: true, enrollments: [{ groupId: 'g1' }] },
    ]),
  };
  prismaMock.payrollClosure = { findUnique: vi.fn().mockResolvedValue(null) };
  prismaMock.classSession = {
    findUnique: vi.fn().mockResolvedValue(existing),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'sess1' }),
    update: vi.fn().mockResolvedValue({}),
  };
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  app = await buildApp('/api/system', (await import('../../src/routes/system.js')).default);
});

beforeEach(() => {
  resetPrisma();
});

describe('POST /api/system/import-attendance', () => {
  it('ADMIN → 403 (solo Superadmin importa)', async () => {
    const token = authAs('ADMIN');
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(ROWS) });
    expect(res.status).toBe(403);
  });

  it('sin archivo → 400', async () => {
    const token = authAs('SUPERADMIN');
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });

  it('vista previa: empareja sin tildes/mayúsculas y no escribe nada', async () => {
    const token = authAs('SUPERADMIN');
    mockCatalog();
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(ROWS), dryRun: true });
    expect(res.status).toBe(200);
    const { totals, classes } = res.body.data;
    expect(totals).toMatchObject({ classes: 1, toImport: 1, errors: 0, records: 2 });
    expect(classes[0]).toMatchObject({
      group: 'MJ1524', professor: 'Wilman Jimenez', assistant: 'Santiago Mera', present: 1, substitute: false, action: 'importar',
    });
    expect(prismaMock.classSession.create).not.toHaveBeenCalled();
    expect(prismaMock.classSession.update).not.toHaveBeenCalled();
  });

  it('estudiante o grupo inexistente → la clase entera va a error', async () => {
    const token = authAs('SUPERADMIN');
    mockCatalog();
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileBase64: fileB64([...ROWS, ['2026-10-13', 'MJ1524', 'Nadie Nunca', 'P'], ['2026-10-13', 'ZZ99', 'Rafael Rivera', 'P']]), dryRun: true });
    const [mj, zz] = res.body.data.classes;
    expect(mj.action).toBe('error');
    expect(mj.errors.join()).toMatch(/Nadie Nunca/);
    expect(zz.action).toBe('error');
    expect(zz.errors.join()).toMatch(/ZZ99 no existe/);
  });

  it('clase ya consolidada → se omite sin tocarla', async () => {
    const token = authAs('SUPERADMIN');
    mockCatalog({ existing: { id: 'x', status: 'REALIZADA', consolidationStatus: 'MATCHED', reports: [{ id: 'r1' }, { id: 'r2' }] } });
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(ROWS), dryRun: false });
    expect(res.body.data.classes[0].action).toBe('omitir');
    expect(prismaMock.classSession.update).not.toHaveBeenCalled();
  });

  it('importa: dos reportes idénticos → MATCHED, pago desbloqueado y asistente confirmado', async () => {
    const token = authAs('SUPERADMIN', 'super1');
    mockCatalog();
    const reports = {};
    prismaMock.classReport = {
      upsert: vi.fn().mockImplementation(({ create }) => {
        reports[create.reporterType] = { id: `rep-${create.reporterType}`, ...create, attendance: [] };
        return Promise.resolve(reports[create.reporterType]);
      }),
    };
    prismaMock.classReportAttendance = {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockImplementation(({ data }) => {
        const rep = Object.values(reports).find((r) => r.id === data[0].classReportId);
        rep.attendance = data;
        return Promise.resolve({ count: data.length });
      }),
    };
    prismaMock.attendanceRecord = {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    };
    prismaMock.costRecord = { deleteMany: vi.fn().mockResolvedValue({}) };
    // ¿Ya existe? → no. consolidateSession lee la sesión con sus dos reportes;
    // costEngine la relee: se le da una sesión no realizada para que no calcule
    // (el motor de costos tiene sus propias pruebas).
    prismaMock.classSession.findUnique = vi.fn().mockImplementation((args) => {
      if (args.select) return Promise.resolve(null);
      if (args.include?.reports) {
        return Promise.resolve({ id: 'sess1', group: { professorId: 'p1' }, reports: Object.values(reports) });
      }
      return Promise.resolve({ id: 'sess1', status: 'PROGRAMADA' });
    });

    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(ROWS), dryRun: false });

    expect(res.status).toBe(200);
    expect(res.body.data.classes[0].action).toBe('importada');
    expect(res.body.data.totals.imported).toBe(1);

    // Un reporte de profesor y uno de coordinador, idénticos
    expect(prismaMock.classReport.upsert).toHaveBeenCalledTimes(2);
    const types = prismaMock.classReport.upsert.mock.calls.map(([a]) => a.create.reporterType);
    expect(types).toEqual(['PROFESSOR', 'COORDINATOR']);
    for (const [a] of prismaMock.classReport.upsert.mock.calls) {
      expect(a.create).toMatchObject({ dictatedByOwner: true, assistantId: 'a1', reportedById: 'super1' });
    }

    // Pago: desbloqueado (fecha pasada) y asistente confirmado
    const payUpdate = prismaMock.classSession.update.mock.calls[0][0].data;
    expect(payUpdate).toMatchObject({ paymentUnlockedById: 'super1', assistantConfirmedId: 'a1' });
    expect(payUpdate.paymentUnlockedAt).toBeTruthy();

    // La consolidación escribió la asistencia final y dejó la clase REALIZADA/MATCHED
    expect(prismaMock.attendanceRecord.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ studentId: 's1', status: 'PRESENTE' }),
        expect.objectContaining({ studentId: 's2', status: 'AUSENTE' }),
      ]),
    });
    const consolidated = prismaMock.classSession.update.mock.calls.map(([a]) => a.data)
      .find((d) => d.consolidationStatus === 'MATCHED');
    expect(consolidated).toMatchObject({ status: 'REALIZADA', assistantId: 'a1' });
  });
});
