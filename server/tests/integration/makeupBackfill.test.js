// mockPrisma MUST be imported before the service (require.cache injection).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { backfillLegacyReport } = require('../../src/services/consolidation.js');

// Las reposiciones reportadas ANTES de la doble consolidación no tienen ningún
// ClassReport. Si al llegar el segundo reporte se consolidaran desde cero, la
// sesión pasaría a PENDING y se borrarían su asistencia y sus costos ya
// liquidados. El rescate convierte ese reporte existente en el del rol que lo
// hizo, para que la consolidación tenga con qué comparar.

const LEGACY = {
  id: 'm1', kind: 'MAKEUP', status: 'REALIZADA', reportedById: 'coord1',
  makeupProfessorId: 'p1', substituteProfessorId: null, assistantId: 'a1',
  _count: { reports: 0 },
};

const RECORDS = [
  { studentId: 's1', status: 'PRESENTE', attendanceType: 'REGULAR', justification: null },
  { studentId: 's2', status: 'AUSENTE', attendanceType: 'REGULAR', justification: null },
];

beforeEach(() => {
  resetPrisma();
  prismaMock.classSession = { findUnique: vi.fn().mockResolvedValue(LEGACY) };
  prismaMock.attendanceRecord = { findMany: vi.fn().mockResolvedValue(RECORDS) };
  prismaMock.user = { findUnique: vi.fn().mockResolvedValue({ role: 'PHYSICAL_TRAINER' }) };
  prismaMock.classReport = { create: vi.fn().mockResolvedValue({ id: 'rep1' }) };
});

describe('backfillLegacyReport — rescate de reposiciones ya reportadas', () => {
  it('convierte la asistencia existente en el reporte del rol que la reportó', async () => {
    const out = await backfillLegacyReport('m1');

    expect(out).toMatchObject({ reporterType: 'COORDINATOR' });
    const data = prismaMock.classReport.create.mock.calls[0][0].data;
    expect(data.reporterType).toBe('COORDINATOR');
    expect(data.reportedById).toBe('coord1');
    expect(data.attendance.create).toEqual([
      { studentId: 's1', status: 'PRESENTE', attendanceType: 'REGULAR', justification: null },
      { studentId: 's2', status: 'AUSENTE', attendanceType: 'REGULAR', justification: null },
    ]);
  });

  it('si la reportó un profesor, el reporte rescatado es el del profesor', async () => {
    prismaMock.user.findUnique = vi.fn().mockResolvedValue({ role: 'TEACHER' });
    const out = await backfillLegacyReport('m1');
    expect(out.reporterType).toBe('PROFESSOR');
  });

  it('sin usuario identificable se asume el coordinador (así se reportaba antes)', async () => {
    prismaMock.classSession.findUnique = vi.fn().mockResolvedValue({ ...LEGACY, reportedById: null });
    const out = await backfillLegacyReport('m1');
    expect(out.reporterType).toBe('COORDINATOR');
  });

  it('un sustituto guardado se conserva como "no lo dictó el titular"', async () => {
    prismaMock.classSession.findUnique = vi.fn().mockResolvedValue({ ...LEGACY, substituteProfessorId: 'p9' });
    await backfillLegacyReport('m1');
    const data = prismaMock.classReport.create.mock.calls[0][0].data;
    expect(data.dictatedByOwner).toBe(false);
    expect(data.dictatingProfessorId).toBe('p9');
  });

  it('no rescata nada si la reposición YA tiene reportes de staging', async () => {
    prismaMock.classSession.findUnique = vi.fn().mockResolvedValue({ ...LEGACY, _count: { reports: 1 } });
    expect(await backfillLegacyReport('m1')).toBe(null);
    expect(prismaMock.classReport.create).not.toHaveBeenCalled();
  });

  it('no rescata una reposición sin reportar (no hay nada que perder)', async () => {
    prismaMock.classSession.findUnique = vi.fn().mockResolvedValue({ ...LEGACY, status: 'PROGRAMADA' });
    expect(await backfillLegacyReport('m1')).toBe(null);
    expect(prismaMock.classReport.create).not.toHaveBeenCalled();
  });

  it('no toca las clases regulares: solo aplica a reposiciones', async () => {
    prismaMock.classSession.findUnique = vi.fn().mockResolvedValue({ ...LEGACY, kind: 'REGULAR' });
    expect(await backfillLegacyReport('m1')).toBe(null);
    expect(prismaMock.classReport.create).not.toHaveBeenCalled();
  });

  it('sin asistencia registrada no hay nada que rescatar', async () => {
    prismaMock.attendanceRecord.findMany = vi.fn().mockResolvedValue([]);
    expect(await backfillLegacyReport('m1')).toBe(null);
  });
});
