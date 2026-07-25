// mockPrisma primero: services/attendanceAlerts.js hace require('../lib/prisma').
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeAttendanceDeviations } = require('../../src/services/attendanceAlerts.js');

// Semestre: feb-2026, grupo lun/mié/vie → 12 fechas esperadas
// (lunes 2,9,16,23 · miércoles 4,11,18,25 · viernes 6,13,20,27).
const SEMESTER = {
  id: 'sem1',
  active: true,
  startDate: new Date('2026-02-02T00:00:00.000Z'),
  endDate: new Date('2026-02-27T00:00:00.000Z'),
  exclusions: [],
};

const GROUP = {
  id: 'g1', code: 'G1', active: true,
  lunes: true, martes: false, miercoles: true, jueves: false, viernes: true, sabado: false, domingo: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function student(id, name) {
  return {
    id, name,
    classesStartDate: null,
    enrollments: [{ enrolledAt: new Date('2026-01-15T00:00:00.000Z'), group: GROUP }],
  };
}

describe('computeAttendanceDeviations — el N/A descuenta clases esperadas', () => {
  beforeEach(() => {
    resetPrisma();
    prismaMock.semester = { findFirst: vi.fn().mockResolvedValue(SEMESTER) };
    prismaMock.student = { findMany: vi.fn().mockResolvedValue([student('s1', 'Ana'), student('s2', 'Beto')]) };
    // Dos queries sobre attendanceRecord: la de "vistas" (OR de clase vista) y
    // la de N/A (status: 'NO_APLICA') — se distinguen por el where.
    prismaMock.attendanceRecord = {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (where.status === 'NO_APLICA') {
          // Ana compró 1 día/semana: los otros 8 días del grupo son N/A.
          return Promise.resolve(Array.from({ length: 8 }, () => ({ studentId: 's1' })));
        }
        // Vistas: Ana asistió sus 4 clases; Beto no ha venido nunca.
        return Promise.resolve(Array.from({ length: 4 }, () => ({ studentId: 's1' })));
      }),
    };
  });

  it('deviation = expected − seen − na; sin N/A la desviación completa', async () => {
    const rows = await computeAttendanceDeviations();
    const ana = rows.find((r) => r.studentId === 's1');
    const beto = rows.find((r) => r.studentId === 's2');

    // Ana: 12 esperadas − 4 vistas − 8 N/A = 0 → sin alerta (antes habría sido ROJA)
    expect(ana.expected).toBe(12);
    expect(ana.seen).toBe(4);
    expect(ana.na).toBe(8);
    expect(ana.deviation).toBe(0);
    expect(ana.level).toBe(null);

    // Beto: sin N/A, la regla no cambia → 12 de desviación, alerta roja
    expect(beto.expected).toBe(12);
    expect(beto.seen).toBe(0);
    expect(beto.na).toBe(0);
    expect(beto.deviation).toBe(12);
    expect(beto.level).toBe('ROJA');
  });

  it('la query de N/A filtra por status NO_APLICA dentro de la ventana del semestre', async () => {
    await computeAttendanceDeviations();
    const calls = prismaMock.attendanceRecord.findMany.mock.calls.map(([args]) => args.where);
    const naWhere = calls.find((w) => w.status === 'NO_APLICA');
    expect(naWhere).toBeDefined();
    expect(naWhere.session.date.gte).toEqual(new Date(SEMESTER.startDate));
    expect(naWhere.session.date.lte).toEqual(new Date(SEMESTER.endDate));
  });
});
