import { describe, it, expect } from 'vitest';
import { expectedDatesForGroup } from '../../src/services/schedule.js';

// Junio 2025: el 1 es domingo → 2 lun, 3 mar, 4 mié, 5 jue, 6 vie, 7 sáb, 8 dom
const semester = {
  startDate: new Date('2025-06-02T00:00:00.000Z'),
  endDate: new Date('2025-06-08T00:00:00.000Z'),
};

function group(flags) {
  return {
    lunes: false,
    martes: false,
    miercoles: false,
    jueves: false,
    viernes: false,
    sabado: false,
    domingo: false,
    ...flags,
  };
}

describe('expectedDatesForGroup', () => {
  it('devuelve [] si no hay semestre', () => {
    expect(expectedDatesForGroup(group({ lunes: true }), null)).toEqual([]);
  });

  it('mantiene solo los días de la semana del grupo', () => {
    const g = group({ lunes: true, miercoles: true });
    expect(expectedDatesForGroup(g, semester, [], new Date('2025-06-08T00:00:00.000Z'))).toEqual([
      '2025-06-02',
      '2025-06-04',
    ]);
  });

  it('excluye las fechas de exclusión del semestre', () => {
    const g = group({ lunes: true, miercoles: true });
    const exclusions = [{ date: new Date('2025-06-04T00:00:00.000Z') }];
    expect(
      expectedDatesForGroup(g, semester, exclusions, new Date('2025-06-08T00:00:00.000Z'))
    ).toEqual(['2025-06-02']);
  });

  it('respeta el piso (floor): no cuenta fechas anteriores a la inscripción', () => {
    const g = group({ lunes: true, miercoles: true });
    // floor = miércoles 4 → el lunes 2 queda fuera
    expect(
      expectedDatesForGroup(
        g,
        semester,
        [],
        new Date('2025-06-08T00:00:00.000Z'),
        new Date('2025-06-04T00:00:00.000Z')
      )
    ).toEqual(['2025-06-04']);
  });

  it('recorta con "until" (no cuenta fechas futuras)', () => {
    const g = group({ lunes: true, miercoles: true });
    // until = martes 3 → solo el lunes 2
    expect(expectedDatesForGroup(g, semester, [], new Date('2025-06-03T00:00:00.000Z'))).toEqual([
      '2025-06-02',
    ]);
  });

  it('devuelve [] si el piso es posterior al fin del semestre', () => {
    const g = group({ lunes: true });
    expect(
      expectedDatesForGroup(
        g,
        semester,
        [],
        new Date('2025-06-08T00:00:00.000Z'),
        new Date('2025-07-01T00:00:00.000Z')
      )
    ).toEqual([]);
  });

  it('un grupo sin días marcados no espera ninguna clase', () => {
    expect(
      expectedDatesForGroup(group({}), semester, [], new Date('2025-06-08T00:00:00.000Z'))
    ).toEqual([]);
  });
});
