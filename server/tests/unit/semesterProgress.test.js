import { describe, it, expect } from 'vitest';
import {
  computeCompletion, projectEndDate, holidayDeviationForGroup,
} from '../../src/services/semesterProgress.js';

const day = (s) => new Date(`${s}T00:00:00.000Z`);
const group = (flags, extra = {}) => ({
  id: 'g', code: 'G1', lunes: false, martes: false, miercoles: false, jueves: false,
  viernes: false, sabado: false, domingo: false, ...flags, ...extra,
});
// Septiembre 2026: lunes 7, 14, 21, 28
const semester = { startDate: day('2026-09-01'), endDate: day('2026-09-30') };

describe('computeCompletion', () => {
  it('completo cuando vio todo el paquete (adquiridas + previas)', () => {
    expect(computeCompletion({ acquired: 30, previous: 10, seen: 40 }))
      .toEqual({ total: 40, remaining: 0, completed: true });
  });
  it('aún no completo: informa cuántas le faltan', () => {
    expect(computeCompletion({ acquired: 40, seen: 37 })).toEqual({ total: 40, remaining: 3, completed: false });
  });
  it('sin paquete nunca queda "completado"', () => {
    expect(computeCompletion({ acquired: 0, seen: 0 }).completed).toBe(false);
  });
  it('respeta medias unidades', () => {
    expect(computeCompletion({ acquired: 10, seen: 8.5 }).remaining).toBe(1.5);
  });
});

describe('projectEndDate', () => {
  const ex = [];
  it('toma la n-ésima clase programada desde la fecha dada', () => {
    const r = projectEndDate([group({ lunes: true })], semester, ex, 2, day('2026-09-01'));
    expect(r).toEqual({ date: '2026-09-14', beyondSemester: false });
  });
  it('salta las fechas excluidas', () => {
    const r = projectEndDate([group({ lunes: true })], semester, [{ date: day('2026-09-07') }], 1, day('2026-09-01'));
    expect(r.date).toBe('2026-09-14');
  });
  it('suma las clases de todos sus grupos', () => {
    const r = projectEndDate([group({ lunes: true }), group({ martes: true })], semester, ex, 3, day('2026-09-01'));
    // mar 1, mar 8 no: clases = mar 1, lun 7, mar 8 → la 3.ª es el 8
    expect(r.date).toBe('2026-09-08');
  });
  it('si no alcanza en el semestre, sigue el horario y avisa que termina después', () => {
    // lunes: 7, 14, 21, 28 de sept; la 6.ª es el 12 de oct
    const r = projectEndDate([group({ lunes: true })], semester, ex, 6, day('2026-09-01'));
    expect(r).toEqual({ date: '2026-10-12', beyondSemester: true });
  });
  it('sin grupos no hay fecha estimada', () => {
    expect(projectEndDate([], semester, ex, 2, day('2026-09-01')).date).toBeNull();
  });
  it('sin clases pendientes no proyecta nada', () => {
    expect(projectEndDate([group({ lunes: true })], semester, ex, 0, day('2026-09-01')).date).toBeNull();
  });
});

describe('holidayDeviationForGroup', () => {
  const exclusions = [
    { date: day('2026-09-14'), reason: 'Festivo' },
    { date: day('2026-09-15'), reason: 'Semana de receso' },
  ];
  it('compara contra el calendario ideal desde el inicio del semestre', () => {
    const r = holidayDeviationForGroup(group({ lunes: true }, { createdAt: day('2026-09-20') }), semester, exclusions);
    // aunque el grupo se creó el 20, el plan ideal cuenta los 4 lunes del semestre
    expect(r.withoutHolidays).toBe(4);
    expect(r.scheduled).toBe(3);
    expect(r.lost).toBe(1);
    expect(r.lostDates).toEqual([{ date: '2026-09-14', reason: 'Festivo' }]);
    expect(r.days).toBe('Lun');
    expect(r.plannedEnd).toBe('2026-09-28');
  });
  it('la fecha final estimada se corre por festivos y lluvia', () => {
    const r = holidayDeviationForGroup(group({ lunes: true }), semester, exclusions, 1);
    expect(r.totalLost).toBe(2);
    // última clase del semestre: lun 28; recuperar 2 → lunes 5 y 12 de octubre
    expect(r.estimatedEnd).toBe('2026-10-12');
  });
  it('sin pérdidas la fecha final es la del plan', () => {
    const r = holidayDeviationForGroup(group({ jueves: true }), semester, exclusions);
    expect(r.totalLost).toBe(0);
    expect(r.estimatedEnd).toBe(r.plannedEnd);
  });
});
