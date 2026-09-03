import { describe, it, expect } from 'vitest';
import { isSeenRecord, seenAttendanceFilter, absenceCounts, attendanceUnits, seenUnits, roundUnits }
  from '../../src/services/attendanceStats.js';

describe('isSeenRecord — regla "clase vista" (P/A/J)', () => {
  it('PRESENTE siempre cuenta como clase vista', () => {
    expect(isSeenRecord({ status: 'PRESENTE' }, 'REGULAR')).toBe(true);
    expect(isSeenRecord({ status: 'PRESENTE' }, 'MAKEUP')).toBe(true);
    expect(isSeenRecord({ status: 'PRESENTE' }, 'FESTIVAL')).toBe(true);
  });

  it('AUSENTE cuenta solo en FESTIVAL', () => {
    expect(isSeenRecord({ status: 'AUSENTE' }, 'FESTIVAL')).toBe(true);
    expect(isSeenRecord({ status: 'AUSENTE' }, 'REGULAR')).toBe(false);
    expect(isSeenRecord({ status: 'AUSENTE' }, 'MAKEUP')).toBe(false);
  });

  it('JUSTIFICADA nunca cuenta, ni siquiera en festival', () => {
    expect(isSeenRecord({ status: 'JUSTIFICADA' }, 'REGULAR')).toBe(false);
    expect(isSeenRecord({ status: 'JUSTIFICADA' }, 'FESTIVAL')).toBe(false);
  });

  it('NO_APLICA nunca cuenta como clase vista (no es asistencia ni ausencia)', () => {
    expect(isSeenRecord({ status: 'NO_APLICA' }, 'REGULAR')).toBe(false);
    expect(isSeenRecord({ status: 'NO_APLICA' }, 'MAKEUP')).toBe(false);
    expect(isSeenRecord({ status: 'NO_APLICA' }, 'FESTIVAL')).toBe(false);
  });
});

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

  it('isSeenRecord: la AUSENTE de festival previa al inicio no consume paquete', () => {
    const rec = { status: 'AUSENTE' };
    expect(isSeenRecord(rec, 'FESTIVAL', new Date('2026-02-15'), start)).toBe(false);
    expect(isSeenRecord(rec, 'FESTIVAL', new Date('2026-03-15'), start)).toBe(true);
    // PRESENTE cuenta siempre, incluso antes del inicio (asistió de verdad)
    expect(isSeenRecord({ status: 'PRESENTE' }, 'REGULAR', new Date('2026-02-15'), start)).toBe(true);
  });
});

describe('seenAttendanceFilter — filtro Prisma equivalente', () => {
  it('cubre PRESENTE y AUSENTE-en-festival', () => {
    expect(seenAttendanceFilter()).toEqual({
      OR: [
        { status: 'PRESENTE' },
        { status: 'AUSENTE', session: { kind: 'FESTIVAL' } },
      ],
    });
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

describe('seenUnits — clases que el registro consume del paquete', () => {
  const doble = { kind: 'MAKEUP', effectiveUnits: 2, date: new Date('2026-03-10') };

  it('el presente en una reposición doble recupera 2 clases', () => {
    expect(seenUnits({ status: 'PRESENTE' }, doble)).toBe(2);
  });

  it('el presente en una reposición sencilla recupera 1', () => {
    expect(seenUnits({ status: 'PRESENTE' }, { kind: 'MAKEUP', effectiveUnits: 1 })).toBe(1);
  });

  it('quien no asiste a la reposición doble no consume nada', () => {
    expect(seenUnits({ status: 'AUSENTE' }, doble)).toBe(0);
    expect(seenUnits({ status: 'JUSTIFICADA' }, doble)).toBe(0);
    expect(seenUnits({ status: 'NO_APLICA' }, doble)).toBe(0);
  });

  it('la clase regular sigue valiendo 1', () => {
    expect(seenUnits({ status: 'PRESENTE' }, { kind: 'REGULAR', effectiveUnits: 1 })).toBe(1);
  });

  it('respeta la fecha de inicio de clases en la AUSENTE de festival', () => {
    const festival = { kind: 'FESTIVAL', effectiveUnits: 1, date: new Date('2026-02-06') };
    expect(seenUnits({ status: 'AUSENTE' }, festival, new Date('2026-02-16'))).toBe(0);
    expect(seenUnits({ status: 'AUSENTE' }, festival, new Date('2026-02-01'))).toBe(1);
  });
});

describe('roundUnits — las medias unidades no arrastran ruido', () => {
  it('redondea a un decimal', () => {
    expect(roundUnits(0.5 + 0.5 + 0.5)).toBe(1.5);
    expect(roundUnits(0.1 + 0.2)).toBe(0.3);
    expect(roundUnits(4)).toBe(4);
  });
});
