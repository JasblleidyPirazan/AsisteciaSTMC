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

  // Clase ya cargada y consolidada: lo que el sistema tiene hoy (s1 P, s2 A, asistente a1)
  const LOADED = (extra = {}) => ({
    id: 'x', status: 'REALIZADA', consolidationStatus: 'MATCHED', firstReportedAt: new Date('2026-10-13'),
    assistantId: 'a1', dictatedByOwner: true, substituteProfessorId: null, makeupProfessorId: null,
    reports: [{ id: 'r1' }, { id: 'r2' }], makeupParticipants: [],
    attendanceRecords: [
      { studentId: 's1', status: 'PRESENTE', attendanceType: 'REGULAR' },
      { studentId: 's2', status: 'AUSENTE', attendanceType: 'REGULAR' },
    ],
    costRecords: [],
    ...extra,
  });

  it('clase ya cargada igual → se omite sin tocarla', async () => {
    const token = authAs('SUPERADMIN');
    mockCatalog({ existing: LOADED() });
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(ROWS), dryRun: false });
    expect(res.body.data.classes[0]).toMatchObject({ action: 'omitir' });
    expect(res.body.data.classes[0].note).toMatch(/sin cambios/);
    expect(prismaMock.classSession.update).not.toHaveBeenCalled();
  });

  it('clase cancelada en el sistema → no se toca', async () => {
    const token = authAs('SUPERADMIN');
    mockCatalog({ existing: LOADED({ status: 'CANCELADA', consolidationStatus: 'PENDING' }) });
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(ROWS), dryRun: false });
    expect(res.body.data.classes[0]).toMatchObject({ action: 'omitir' });
    expect(prismaMock.classSession.update).not.toHaveBeenCalled();
  });

  // Archivo con cambios frente a lo cargado: Rafael pasa de A a P
  const CHANGED = [
    ['2026-10-13', 'MJ1524', 'María del Mar Cardona', 'P', null, 'Wilman Jimenez', 'Santiago Mera'],
    ['2026-10-13', 'MJ1524', 'Rafael Rivera', 'P', null, null, null],
  ];

  it('clase ya cargada con cambios → vista previa los lista y no escribe', async () => {
    const token = authAs('SUPERADMIN');
    mockCatalog({ existing: LOADED() });
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(CHANGED), dryRun: true });
    const c = res.body.data.classes[0];
    expect(c.action).toBe('actualizar');
    expect(c.changes).toEqual(['Rafael Rivera: A → P']);
    expect(res.body.data.totals).toMatchObject({ toUpdate: 1, toImport: 0, skipped: 0 });
    expect(prismaMock.classSession.update).not.toHaveBeenCalled();
  });

  // Mocks para aplicar una actualización completa
  function mockApplyChain(loaded, costsAfter = []) {
    mockCatalog({ existing: loaded });
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
        Object.values(reports).find((r) => r.id === data[0].classReportId).attendance = data;
        return Promise.resolve({});
      }),
    };
    prismaMock.attendanceRecord = { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) };
    prismaMock.costRecord = {
      deleteMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(costsAfter),
      update: vi.fn().mockResolvedValue({}),
    };
    prismaMock.sessionEditLog = { create: vi.fn().mockResolvedValue({}) };
    prismaMock.classSession.findUnique = vi.fn().mockImplementation((args) => {
      if (args.select) return Promise.resolve(loaded);
      if (args.include?.reports) return Promise.resolve({ id: 'x', group: { professorId: 'p1' }, reports: Object.values(reports) });
      return Promise.resolve({ id: 'x', status: 'PROGRAMADA' });
    });
  }

  it('aplica la actualización: el archivo manda, se guarda constancia y se conserva la aprobación si el monto no cambia', async () => {
    const token = authAs('SUPERADMIN', 'super1');
    const stamp = new Date('2026-10-20');
    mockApplyChain(
      LOADED({ costRecords: [{ id: 'c1', payeeType: 'PROFESSOR', professorId: 'p1', assistantId: null, total: 38000, approvedAt: stamp, approvedById: 'adm', paidAt: stamp, paidById: 'adm', heldAt: null, heldById: null }] }),
      [{ id: 'n1', payeeType: 'PROFESSOR', professorId: 'p1', assistantId: null, total: 38000, payStatus: 'PAYABLE' }],
    );
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(CHANGED), dryRun: false });
    const c = res.body.data.classes[0];
    expect(c.action).toBe('actualizada');
    expect(res.body.data.totals.updated).toBe(1);
    // Rafael ahora presente en los dos reportes
    for (const [a] of prismaMock.classReport.upsert.mock.calls) {
      expect(a.create.reporterType).toMatch(/PROFESSOR|COORDINATOR/);
    }
    const written = prismaMock.classReportAttendance.createMany.mock.calls[0][0].data;
    expect(written).toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: 's2', status: 'PRESENTE' }),
      expect.objectContaining({ studentId: 's1', status: 'PRESENTE' }),
    ]));
    // Constancia de lo anterior
    const log = prismaMock.sessionEditLog.create.mock.calls[0][0].data;
    expect(log.editedById).toBe('super1');
    expect(log.previousState.records).toEqual(expect.arrayContaining([expect.objectContaining({ studentId: 's2', status: 'AUSENTE' })]));
    // El pago ya aprobado/pagado con el mismo monto conserva su marca
    expect(prismaMock.costRecord.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: expect.objectContaining({ approvedAt: stamp, paidAt: stamp }),
    });
    expect(c.warnings).toEqual([]);
  });

  it('si el pago ya aprobado cambia de monto, queda pendiente y se avisa', async () => {
    const token = authAs('SUPERADMIN');
    const stamp = new Date('2026-10-20');
    mockApplyChain(
      LOADED({ costRecords: [{ id: 'c1', payeeType: 'PROFESSOR', professorId: 'p1', assistantId: null, total: 38000, approvedAt: stamp, approvedById: 'adm', paidAt: stamp, paidById: 'adm', heldAt: null, heldById: null }] }),
      [{ id: 'n1', payeeType: 'PROFESSOR', professorId: 'p1', assistantId: null, total: 40000, payStatus: 'PAYABLE' }],
    );
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(CHANGED), dryRun: false });
    expect(prismaMock.costRecord.update).not.toHaveBeenCalled();
    expect(res.body.data.classes[0].warnings[0]).toMatch(/ya estaba pagado.*38\.000.*40\.000.*pendiente/);
  });

  it('estudiante que el archivo no trae se conserva (no se borra asistencia real)', async () => {
    const token = authAs('SUPERADMIN');
    mockApplyChain(LOADED());
    // El archivo solo trae a Rafael (cambia A → P); María del Mar queda como estaba
    const only = [['2026-10-13', 'MJ1524', 'Rafael Rivera', 'P', null, null, null]];
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(only), dryRun: false });
    expect(res.body.data.classes[0].action).toBe('actualizada');
    const written = prismaMock.classReportAttendance.createMany.mock.calls[0][0].data;
    expect(written.map((r) => r.studentId).sort()).toEqual(['s1', 's2']);
    expect(written.find((r) => r.studentId === 's1').status).toBe('PRESENTE');
  });

  it('Profesor/Asistente en blanco en el archivo no borran los que ya estaban', async () => {
    const token = authAs('SUPERADMIN');
    mockApplyChain(LOADED());
    const blank = [['2026-10-13', 'MJ1524', 'Rafael Rivera', 'P', null, null, null]];
    const res = await request(app).post('/api/system/import-attendance')
      .set('Authorization', `Bearer ${token}`).send({ fileBase64: fileB64(blank), dryRun: false });
    for (const [a] of prismaMock.classReport.upsert.mock.calls) {
      expect(a.create).toMatchObject({ assistantId: 'a1', dictatedByOwner: true });
    }
    expect(res.body.data.classes[0].changes).toEqual(['Rafael Rivera: A → P']);
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
