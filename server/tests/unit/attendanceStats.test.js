import { describe, it, expect } from 'vitest';
import { absenceCounts, attendanceUnits, roundUnits }
  from '../../src/services/attendanceStats.js';

describe('absenceCounts — las faltas cuentan solo desde el inicio de clases', () => {
  const start = new Date('2026-03-01T00:00:00.000Z');

  it('AUSENTE anterior a classesStartDate no cuenta', () => {
    expect(absenceCounts(new Date('2026-02-15'), start)).toBe(false);
  });

  it('AUSENTE el mismo día del inicio o después sí cuenta', () => {
    expect(absenceCounts(new Date('2026-03-01'), start)).toBe(true);
    expect(absenceCounts(new Date('2026-04-10'), start)).toBe(true);
  });

  it('sin fecha de inicio (o sin fecha de sesión) la falta cuenta normal', () => {
    expect(absenceCounts(new Date('2026-02-15'), null)).toBe(true);
    expect(absenceCounts(undefined, start)).toBe(true);
  });
});

describe('attendanceUnits — reposición sencilla vs doble', () => {
  it('la sesión vale lo que declara su programación', () => {
    expect(attendanceUnits({ kind: 'MAKEUP', effectiveUnits: 1 })).toBe(1);
    expect(attendanceUnits({ kind: 'MAKEUP', effectiveUnits: 2 })).toBe(2);
    expect(attendanceUnits({ kind: 'MAKEUP', effectiveUnits: 0.5 })).toBe(0.5);
  });

  it('Prisma entrega Decimal como string: se interpreta igual', () => {
    expect(attendanceUnits({ kind: 'MAKEUP', effectiveUnits: '2.0' })).toBe(2);
  });

  it('sin dato válido vale 1 (clases regulares, festivales, sesiones legadas)', () => {
    expect(attendanceUnits({ kind: 'REGULAR', effectiveUnits: 1 })).toBe(1);
    expect(attendanceUnits({ kind: 'FESTIVAL' })).toBe(1);
    expect(attendanceUnits(undefined)).toBe(1);
    expect(attendanceUnits({ effectiveUnits: 0 })).toBe(1);
  });
});

describe('roundUnits — las medias unidades no arrastran ruido', () => {
  it('redondea a un decimal', () => {
    expect(roundUnits(0.5 + 0.5 + 0.5)).toBe(1.5);
    expect(roundUnits(0.1 + 0.2)).toBe(0.3);
    expect(roundUnits(4)).toBe(4);
  });
});

describe('consumedUnits — "vistas" = asistencias + ausencias + reposiciones', () => {
  const { consumedUnits } = require('../../src/services/attendanceStats.js');
  const d = (s) => new Date(`${s}T00:00:00.000Z`);
  const reg = { kind: 'REGULAR', date: d('2026-09-10'), effectiveUnits: 1 };
  it('asistencia y ausencia consumen la clase; justificada y N/A no', () => {
    expect(consumedUnits({ status: 'PRESENTE' }, reg)).toBe(1);
    expect(consumedUnits({ status: 'AUSENTE' }, reg)).toBe(1);
    expect(consumedUnits({ status: 'JUSTIFICADA' }, reg)).toBe(0);
    expect(consumedUnits({ status: 'NO_APLICA' }, reg)).toBe(0);
  });
  it('reposición doble vale 2 (asista o falte)', () => {
    const doble = { kind: 'MAKEUP', date: d('2026-09-10'), effectiveUnits: 2 };
    expect(consumedUnits({ status: 'PRESENTE' }, doble)).toBe(2);
    expect(consumedUnits({ status: 'AUSENTE' }, doble)).toBe(2);
  });
  it('una ausencia anterior al inicio de clases no consume', () => {
    expect(consumedUnits({ status: 'AUSENTE' }, reg, d('2026-09-15'))).toBe(0);
    expect(consumedUnits({ status: 'PRESENTE' }, reg, d('2026-09-15'))).toBe(1);
  });
});
