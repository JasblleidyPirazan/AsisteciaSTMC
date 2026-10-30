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

describe('notMyDays — días N/A del estudiante', () => {
  const { notMyDays } = require('../../src/services/semesterProgress');
  const rec = (status, date, groupId = 'g1') => ({ status, session: { groupId, date: new Date(`${date}T00:00:00Z`) } });
  it('un día con solo N/A no le toca; uno mezclado sí', () => {
    // 2026-10-05 lunes (1), 2026-10-07 miércoles (3), 2026-10-12 lunes
    const skip = notMyDays([rec('NO_APLICA', '2026-10-05'), rec('PRESENTE', '2026-10-07'), rec('NO_APLICA', '2026-10-12')]);
    expect(skip.has('g1:1')).toBe(true);
    expect(skip.has('g1:3')).toBe(false);
  });
  it('un lunes con N/A y también asistencia sí le toca', () => {
    expect(notMyDays([rec('NO_APLICA', '2026-10-05'), rec('PRESENTE', '2026-10-12')]).size).toBe(0);
  });
});

describe('splitDebt — reposición vs. recuperar por calendario', () => {
  const { splitDebt } = require('../../src/services/semesterProgress');
  it('lluvia + justificadas son reposición; festivos, calendario', () => {
    expect(splitDebt({ rain: 1, justified: 2, holidays: 4, remaining: 20, total: 20 })).toEqual({ pending: 3, calendar: 4 });
  });
  it('lo repuesto baja primero la reposición y el excedente el calendario', () => {
    expect(splitDebt({ rain: 2, holidays: 3, madeUp: 1, remaining: 20, total: 20 })).toEqual({ pending: 1, calendar: 3 });
    expect(splitDebt({ rain: 2, holidays: 3, madeUp: 4, remaining: 20, total: 20 })).toEqual({ pending: 0, calendar: 1 });
  });
  it('ambas se topan en lo que le queda del paquete (reposición primero)', () => {
    expect(splitDebt({ rain: 3, holidays: 4, remaining: 5, total: 20 })).toEqual({ pending: 3, calendar: 2 });
  });
  it('sin paquete no hay nada que reportar', () => {
    expect(splitDebt({ rain: 3, holidays: 4, remaining: 0, total: 0 })).toEqual({ pending: 0, calendar: 0 });
  });
});

describe('classesLeftInSemester', () => {
  const { classesLeftInSemester } = require('../../src/services/semesterProgress');
  it('cuenta sus días hasta el cierre, sin festivos ni días N/A', () => {
    const lunMie = group({ lunes: true, miercoles: true }, { id: 'g1' });
    // desde el 14 sep: lun 14, mié 16, lun 21, mié 23, lun 28, mié 30 = 6
    expect(classesLeftInSemester([lunMie], semester, [], day('2026-09-14'))).toBe(6);
    expect(classesLeftInSemester([lunMie], semester, [{ date: day('2026-09-21') }], day('2026-09-14'))).toBe(5);
    // los lunes son N/A para este estudiante: solo miércoles
    expect(classesLeftInSemester([lunMie], semester, [], day('2026-09-14'), new Set(['g1:1']))).toBe(3);
  });
});
