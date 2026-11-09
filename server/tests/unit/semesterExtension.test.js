import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validateExtension, validateSemesterDates } = require('../../src/services/semesterExtension.js');

const D = (s) => new Date(`${s}T00:00:00Z`);
const SEM = { id: 's2', name: '2026-2', startDate: D('2026-07-14'), endDate: D('2026-12-05') };
const NEXT = { id: 's3', name: '2027-1', startDate: D('2027-01-19') };
const PREV = { id: 's1', name: '2026-1', startDate: D('2026-01-20') };

describe('validateExtension', () => {
  it('amplía hasta una fecha posterior al fin actual', () => {
    expect(validateExtension({ semester: SEM, allSemesters: [PREV, SEM, NEXT], newEnd: '2026-12-12' }))
      .toEqual({ from: '2026-12-05', to: '2026-12-12', days: 7, next: { id: 's3', name: '2027-1', startDate: '2027-01-19' } });
  });
  it('rechaza fechas inválidas, iguales o anteriores al fin actual', () => {
    for (const newEnd of ['', 'mañana', '2026-13-40', '2026-12-05', '2026-11-30']) {
      expect(validateExtension({ semester: SEM, newEnd }).error).toBeTruthy();
    }
  });
  it('no deja llegar al inicio del semestre siguiente (la ventana D4 ya sería del otro)', () => {
    expect(validateExtension({ semester: SEM, allSemesters: [SEM, NEXT], newEnd: '2027-01-19' }).error).toMatch(/2027-1/);
    expect(validateExtension({ semester: SEM, allSemesters: [SEM, NEXT], newEnd: '2027-01-18' }).error).toBeUndefined();
  });
  it('un semestre anterior no limita', () => {
    expect(validateExtension({ semester: SEM, allSemesters: [PREV, SEM], newEnd: '2026-12-20' }).next).toBeNull();
  });
  it('máximo 120 días de una vez', () => {
    expect(validateExtension({ semester: SEM, newEnd: '2027-04-05' }).error).toMatch(/120/);
  });
});

describe('validateSemesterDates', () => {
  it('fin después del inicio y antes del semestre siguiente', () => {
    expect(validateSemesterDates({ semester: SEM, allSemesters: [SEM, NEXT] })).toEqual({});
    expect(validateSemesterDates({ semester: { ...SEM, endDate: D('2026-07-01') } }).error).toMatch(/posterior/);
    expect(validateSemesterDates({ semester: { ...SEM, endDate: D('2027-02-01') }, allSemesters: [SEM, NEXT] }).error).toMatch(/2027-1/);
  });
});
