import { describe, it, expect } from 'vitest';
import { buildTrackingRows, countRecords, countRain, countHolidays, consumedTotal, progressPct, isMakeupRecord }
  from '../../src/services/studentTracking.js';

const s = (date, kind = 'REGULAR') => ({ date: new Date(date), kind });
const rec = (status, session, attendanceType = 'REGULAR') => ({ status, attendanceType, session });

describe('isMakeupRecord — qué cuenta como reposición', () => {
  it('sesión de reposición grupal (kind=MAKEUP)', () => {
    expect(isMakeupRecord(rec('PRESENTE', s('2026-03-02', 'MAKEUP')))).toBe(true);
  });
  it('estudiante invitado a una clase regular (attendanceType=REPOSICION)', () => {
    expect(isMakeupRecord(rec('PRESENTE', s('2026-03-02'), 'REPOSICION'))).toBe(true);
  });
  it('clase regular normal, no', () => {
    expect(isMakeupRecord(rec('PRESENTE', s('2026-03-02')))).toBe(false);
    expect(isMakeupRecord(rec('PRESENTE', s('2026-03-02', 'FESTIVAL')))).toBe(false);
  });
});

describe('countRecords — conteo por estudiante', () => {
  it('separa asistencias, faltas, justificadas, N/A y reposiciones', () => {
    const c = countRecords([
      rec('PRESENTE', s('2026-03-02')),
      rec('PRESENTE', s('2026-03-04')),
      rec('AUSENTE', s('2026-03-06')),
      rec('JUSTIFICADA', s('2026-03-09')),
      rec('NO_APLICA', s('2026-03-11')),
      rec('PRESENTE', s('2026-03-13', 'MAKEUP')),
      rec('PRESENTE', s('2026-03-16'), 'REPOSICION'),
    ], null);
    expect(c).toEqual({ present: 2, absent: 1, justified: 1, na: 1, makeup: 2, rain: 0, holiday: 0 });
  });

  it('la falta anterior al inicio de clases no cuenta (nota 46)', () => {
    const records = [rec('AUSENTE', s('2026-02-01')), rec('AUSENTE', s('2026-03-10'))];
    expect(countRecords(records, new Date('2026-03-01')).absent).toBe(1);
    expect(countRecords(records, null).absent).toBe(2);
  });

  it('la asistencia anterior al inicio de clases sí cuenta (fue de verdad)', () => {
    expect(countRecords([rec('PRESENTE', s('2026-02-01'))], new Date('2026-03-01')).present).toBe(1);
  });

  it('la AUSENTE de festival entra en faltas (allí sí consume paquete)', () => {
    expect(countRecords([rec('AUSENTE', s('2026-03-10', 'FESTIVAL'))], null).absent).toBe(1);
  });
});

describe('countRain — clases caídas por lluvia', () => {
  const rainByGroup = { g1: [new Date('2026-02-10'), new Date('2026-03-10')], g2: [new Date('2026-03-12')] };

  it('suma las de todos sus grupos', () => {
    expect(countRain(['g1', 'g2'], rainByGroup, null)).toBe(3);
  });
  it('solo desde su fecha de inicio de clases', () => {
    expect(countRain(['g1', 'g2'], rainByGroup, new Date('2026-03-01'))).toBe(2);
  });
  it('sin grupos, cero', () => {
    expect(countRain([], rainByGroup, null)).toBe(0);
  });
});

describe('countHolidays — clases no dictadas por festivos', () => {
  // 2026-03-09 es lunes; 2026-03-12 es jueves.
  const feriados = [new Date('2026-03-09'), new Date('2026-03-12')];
  const lunesYMiercoles = { lunes: true, miercoles: true };
  const martesYJueves = { martes: true, jueves: true };

  it('cuenta el festivo solo si cae en un día de clase del grupo', () => {
    expect(countHolidays([lunesYMiercoles], feriados, null)).toBe(1); // el lunes
    expect(countHolidays([martesYJueves], feriados, null)).toBe(1);   // el jueves
    expect(countHolidays([{ sabado: true }], feriados, null)).toBe(0);
  });

  it('un estudiante en dos grupos pierde una clase por cada uno', () => {
    expect(countHolidays([lunesYMiercoles, martesYJueves], feriados, null)).toBe(2);
    // Dos grupos que coinciden el mismo festivo: pierde las dos clases.
    expect(countHolidays([lunesYMiercoles, { lunes: true }], feriados, null)).toBe(2);
  });

  it('solo desde su fecha de inicio de clases', () => {
    expect(countHolidays([lunesYMiercoles, martesYJueves], feriados, new Date('2026-03-10'))).toBe(1);
    expect(countHolidays([lunesYMiercoles, martesYJueves], feriados, new Date('2026-04-01'))).toBe(0);
  });

  it('sin grupos o sin festivos, cero', () => {
    expect(countHolidays([], feriados, null)).toBe(0);
    expect(countHolidays([lunesYMiercoles], [], null)).toBe(0);
  });
});

describe('buildTrackingRows — filas de la vista', () => {
  const students = [{
    id: 'a', name: 'Alana Cortés', document: '1001', classesAcquired: 30, previousClasses: 10,
    classesStartDate: null, studentStatus: 'MATRICULADO',
    enrollments: [
      { enrollmentType: 'PRIMARY', group: { id: 'g1', code: 'MJ1522', ballLevel: 'Verde', professor: { name: 'Ana' }, lunes: true } },
      { enrollmentType: 'SECONDARY', group: { id: 'g2', code: 'S541', ballLevel: 'Verde', professor: { name: 'Beto' }, sabado: true } },
    ],
  }];
  const records = [
    { studentId: 'a', ...rec('PRESENTE', s('2026-03-02')) },
    { studentId: 'a', ...rec('AUSENTE', s('2026-03-04')) },
    { studentId: 'a', ...rec('PRESENTE', s('2026-03-06', 'MAKEUP')) },
  ];
  const [row] = buildTrackingRows({
    students, records,
    rainDatesByGroup: { g1: [new Date('2026-03-09')] },
    exclusionDates: [new Date('2026-03-16')], // lunes → solo afecta a g1
  });

  it('adquiridas suma las clases del semestre anterior', () => {
    expect(row.acquired).toBe(40);
  });
  it('toma el grupo principal y lista los secundarios aparte', () => {
    expect(row.groupCode).toBe('MJ1522');
    expect(row.otherGroups).toEqual(['S541']);
    expect(row.professor).toBe('Ana');
  });
  it('trae los conteos, la lluvia y los festivos', () => {
    expect(row).toMatchObject({ present: 1, absent: 1, makeup: 1, justified: 0, na: 0, rain: 1, holiday: 1 });
  });
  it('un estudiante sin registros queda en ceros', () => {
    const [solo] = buildTrackingRows({ students: [{ id: 'z', name: 'Sin clases', classesAcquired: 8, enrollments: [] }], records: [] });
    expect(solo).toMatchObject({ present: 0, absent: 0, makeup: 0, rain: 0, holiday: 0, acquired: 8, groupCode: null });
  });
});

describe('consumedTotal / progressPct — avance del paquete', () => {
  const row = { present: 26, absent: 14, makeup: 0, acquired: 40 };

  it('por defecto la falta consume clase (el estudiante la pagó y no vino)', () => {
    expect(consumedTotal(row)).toBe(40);
    expect(progressPct(row)).toBe(100);
  });
  it('con countAbsences=false solo cuenta lo efectivamente visto', () => {
    expect(consumedTotal(row, false)).toBe(26);
    expect(progressPct(row, false)).toBe(65);
  });
  it('las reposiciones siempre suman', () => {
    expect(consumedTotal({ present: 21, absent: 0, makeup: 32, acquired: 46 })).toBe(53);
    expect(progressPct({ present: 21, absent: 0, makeup: 32, acquired: 46 })).toBe(115.2);
  });
  it('sin clases adquiridas no hay porcentaje', () => {
    expect(progressPct({ present: 3, absent: 0, makeup: 0, acquired: 0 })).toBe(null);
  });
});
