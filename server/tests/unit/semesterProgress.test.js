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
  it('si el calendario no alcanza, termina fuera del semestre', () => {
    const r = projectEndDate([group({ lunes: true })], semester, ex, 9, day('2026-09-01'));
    expect(r).toEqual({ date: null, beyondSemester: true });
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
  it('cuenta solo las fechas excluidas que caen en días del grupo', () => {
    const r = holidayDeviationForGroup(group({ lunes: true }), semester, exclusions);
    expect(r.withoutHolidays).toBe(4);
    expect(r.scheduled).toBe(3);
    expect(r.lost).toBe(1);
    expect(r.lostDates).toEqual([{ date: '2026-09-14', reason: 'Festivo' }]);
    expect(r.days).toBe('Lun');
  });
  it('un grupo martes pierde otra fecha', () => {
    const r = holidayDeviationForGroup(group({ martes: true }), semester, exclusions);
    expect(r.lostDates.map((d) => d.date)).toEqual(['2026-09-15']);
  });
  it('un grupo sin días afectados no pierde clases', () => {
    const r = holidayDeviationForGroup(group({ jueves: true }), semester, exclusions);
    expect(r.lost).toBe(0);
  });
});
