import { describe, it, expect } from 'vitest';
import { holidayDeviationForGroup } from '../../src/services/semesterProgress.js';

const day = (s) => new Date(`${s}T00:00:00.000Z`);
const group = (flags, extra = {}) => ({
  id: 'g', code: 'G1', lunes: false, martes: false, miercoles: false, jueves: false,
  viernes: false, sabado: false, domingo: false, ...flags, ...extra,
});
// Septiembre 2026: lunes 7, 14, 21, 28
const semester = { startDate: day('2026-09-01'), endDate: day('2026-09-30') };

describe('holidayDeviationForGroup — plan de 40 clases', () => {
  const exclusions = [
    { date: day('2026-09-14'), reason: 'Festivo' },
    { date: day('2026-09-15'), reason: 'Semana de receso' },
  ];
  const lunes = group({ lunes: true });

  it('el plan es de N clases desde el inicio del semestre', () => {
    // lunes: 7, 14, 21, 28 de sept, 5, 12... → la 6.ª es el 12 de oct
    const r = holidayDeviationForGroup(lunes, semester, exclusions, { plan: 12, todayStr: '2026-09-01' });
    expect(r.plannedStart).toBe('2026-09-07');
    expect(r.plannedEnd).toBe('2026-10-12');
    expect(r.plan).toBe(6);
  });
  it('la fecha final estimada salta los festivos', () => {
    const r = holidayDeviationForGroup(lunes, semester, exclusions, { plan: 12, todayStr: '2026-09-01' });
    // sin el lunes 14: 7, 21, 28, 5, 12, 19 → la 6.ª es el 19 de oct
    expect(r.estimatedEnd).toBe('2026-10-19');
    expect(r.lost).toBe(1);
    expect(r.lostDates).toEqual([{ date: '2026-09-14', reason: 'Festivo' }]);
    expect(r.delayDays).toBe(7);
  });
  it('lo que no se dictó (lluvia) corre la fecha: se estima con lo que falta', () => {
    // Hoy 29 sept; dadas 3 de 6 (el 14 festivo, el 21 llovió) → faltan 3: 5, 12 y 19 de oct
    const r = holidayDeviationForGroup(lunes, semester, exclusions, { plan: 12, given: 3, rain: 1, todayStr: '2026-09-29' });
    expect(r.remaining).toBe(3);
    expect(r.estimatedEnd).toBe('2026-10-19');
    expect(r.totalLost).toBe(2);
  });
  it('si la clase de hoy ya se dio, la proyección arranca mañana', () => {
    const base = { plan: 12, given: 4, todayStr: '2026-10-05' };
    expect(holidayDeviationForGroup(lunes, semester, exclusions, { ...base, givenToday: false }).estimatedEnd).toBe('2026-10-12');
    expect(holidayDeviationForGroup(lunes, semester, exclusions, { ...base, givenToday: true }).estimatedEnd).toBe('2026-10-19');
  });
  it('plan completo: no hay nada que estimar', () => {
    const r = holidayDeviationForGroup(lunes, semester, exclusions, { plan: 6, given: 3, todayStr: '2026-10-01' });
    expect(r.remaining).toBe(0);
    expect(r.delayDays).toBeNull();
  });
  it('un grupo de un solo día tiene la mitad del plan; uno de 2+ días, el plan completo', () => {
    const one = holidayDeviationForGroup(lunes, semester, exclusions, { plan: 40, todayStr: '2026-09-01' });
    expect(one.plan).toBe(20);
    const two = holidayDeviationForGroup(group({ lunes: true, miercoles: true }), semester, exclusions, { plan: 40, todayStr: '2026-09-01' });
    expect(two.plan).toBe(40);
  });
  it('un grupo sin días afectados no pierde clases', () => {
    const r = holidayDeviationForGroup(group({ jueves: true }), semester, exclusions, { plan: 10, todayStr: '2026-09-01' });
    expect(r.totalLost).toBe(0);
    expect(r.estimatedEnd).toBe(r.plannedEnd);
  });
});
