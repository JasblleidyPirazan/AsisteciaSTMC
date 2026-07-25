import { describe, it, expect } from 'vitest';
import { isSeenRecord, seenAttendanceFilter } from '../../src/services/attendanceStats.js';

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
