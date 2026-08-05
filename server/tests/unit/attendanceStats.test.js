import { describe, it, expect } from 'vitest';
import { isSeenRecord, seenAttendanceFilter, absenceCounts } from '../../src/services/attendanceStats.js';

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
