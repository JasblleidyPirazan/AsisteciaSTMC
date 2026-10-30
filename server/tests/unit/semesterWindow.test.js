import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { semesterWindow, inWindow } = require('../../src/lib/semesterWindow');

const d = (s) => new Date(`${s}T00:00:00.000Z`);
const S1 = { id: 's1', startDate: d('2026-08-01'), endDate: d('2026-11-30') };
const S2 = { id: 's2', startDate: d('2027-02-01'), endDate: d('2027-05-30') };
const S3 = { id: 's3', startDate: d('2027-08-01'), endDate: d('2027-11-30') };

describe('semesterWindow — regla D4', () => {
  it('termina en el inicio del semestre inmediatamente posterior', () => {
    expect(semesterWindow(S1, [S1, S2, S3])).toEqual({ from: '2026-08-01', to: '2027-02-01' });
    expect(semesterWindow(S2, [S1, S2, S3])).toEqual({ from: '2027-02-01', to: '2027-08-01' });
  });
  it('sin semestre posterior no hay límite superior', () => {
    expect(semesterWindow(S3, [S1, S2, S3])).toEqual({ from: '2027-08-01', to: null });
    expect(semesterWindow(S1, [S1])).toEqual({ from: '2026-08-01', to: null });
    expect(semesterWindow(S1)).toEqual({ from: '2026-08-01', to: null });
  });
  it('no depende del orden de la lista ni de que incluya al propio semestre', () => {
    expect(semesterWindow(S1, [S3, S2])).toEqual({ from: '2026-08-01', to: '2027-02-01' });
  });
  it('un semestre anterior no cuenta como límite', () => {
    expect(semesterWindow(S2, [S1])).toEqual({ from: '2027-02-01', to: null });
  });
  it('endDate no es el límite: la ventana sigue más allá del cierre', () => {
    const w = semesterWindow(S1, [S1, S2]);
    expect(inWindow(w, '2026-12-07')).toBe(true);   // después de endDate (30 nov), antes del siguiente semestre
    expect(inWindow(w, '2027-01-31')).toBe(true);
  });
  it('el inicio es inclusivo y el siguiente semestre es exclusivo', () => {
    const w = semesterWindow(S1, [S1, S2]);
    expect(inWindow(w, '2026-07-31')).toBe(false);
    expect(inWindow(w, '2026-08-01')).toBe(true);
    expect(inWindow(w, '2027-01-31')).toBe(true);
    expect(inWindow(w, '2027-02-01')).toBe(false);
    expect(inWindow(w, '2027-02-03')).toBe(false);
  });
  it('acepta fechas como cadenas y Date', () => {
    expect(semesterWindow({ startDate: '2026-08-01' }, [{ startDate: '2027-02-01' }])).toEqual({ from: '2026-08-01', to: '2027-02-01' });
    expect(inWindow({ from: '2026-08-01', to: null }, d('2030-01-01'))).toBe(true);
  });
});
