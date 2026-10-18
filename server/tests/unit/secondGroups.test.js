import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildSecondGroupRows, isRegular, mainEnrollment, weekKey } = require('../../src/services/secondGroups.js');

const G = {
  MJ1933: { code: 'MJ1933', professor: { name: 'Ricardo Marino' } },
  MJ1724: { code: 'MJ1724', professor: { name: 'Wilman Jimenez' } },
  LM2222: { code: 'LM2222', professor: { name: 'German Arenas' } },
};

function rec(studentId, groupId, date, extra = {}) {
  return {
    studentId, status: 'PRESENTE', attendanceType: 'REPOSICION',
    session: { date: new Date(`${date}T00:00:00Z`), kind: 'REGULAR', groupId, group: G[groupId] },
    ...extra,
  };
}

const maria = {
  id: 'mp', name: 'Maria Paz Brieva', document: '123', studentStatus: 'INSCRITO',
  enrollments: [{ groupId: 'MJ1933', enrollmentType: 'PRIMARY', enrolledAt: new Date('2026-08-01'), group: G.MJ1933 }],
};

describe('weekKey / mainEnrollment', () => {
  it('agrupa por semana con lunes como inicio', () => {
    expect(weekKey(new Date('2026-10-13T00:00:00Z'))).toBe('2026-10-12'); // martes
    expect(weekKey(new Date('2026-10-18T00:00:00Z'))).toBe('2026-10-12'); // domingo
    expect(weekKey(new Date('2026-10-19T00:00:00Z'))).toBe('2026-10-19'); // lunes
  });

  it('grupo principal = primera inscripción PRIMARY', () => {
    const e = mainEnrollment([
      { groupId: 'B', enrollmentType: 'SECONDARY', enrolledAt: '2026-01-01' },
      { groupId: 'A', enrollmentType: 'PRIMARY', enrolledAt: '2026-02-01' },
    ]);
    expect(e.groupId).toBe('A');
  });
});

describe('buildSecondGroupRows', () => {
  it('cuenta veces, semanas, días y primera fecha por estudiante + otro grupo', () => {
    const rows = buildSecondGroupRows({
      students: [maria],
      records: [
        rec('mp', 'MJ1724', '2026-10-13'),
        rec('mp', 'MJ1724', '2026-10-15'),
        rec('mp', 'MJ1724', '2026-10-20'),
        rec('mp', 'LM2222', '2026-10-14'),
        rec('mp', 'MJ1933', '2026-10-14', { attendanceType: 'REGULAR' }), // su propio grupo: no cuenta
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Maria Paz Brieva', mainGroupCode: 'MJ1933', groupCode: 'MJ1724', professor: 'Wilman Jimenez',
      visits: 3, weeks: 2, firstDate: '2026-10-13', lastDate: '2026-10-20', enrolled: false,
    });
    expect(rows[0].weekdays).toEqual(['Mar', 'Jue']);
    expect(rows[1]).toMatchObject({ groupCode: 'LM2222', visits: 1, weeks: 1 });
    expect(isRegular(rows[0])).toBe(true);
    expect(isRegular(rows[1])).toBe(false);
  });

  it('ignora ausencias, reposiciones grupales y festivales', () => {
    const rows = buildSecondGroupRows({
      students: [maria],
      records: [
        rec('mp', 'MJ1724', '2026-10-13', { status: 'AUSENTE' }),
        { studentId: 'mp', status: 'PRESENTE', attendanceType: 'REGULAR', session: { date: new Date('2026-10-17'), kind: 'MAKEUP', groupId: null } },
        { studentId: 'mp', status: 'PRESENTE', attendanceType: 'REGULAR', session: { date: new Date('2026-10-17'), kind: 'FESTIVAL', groupId: null } },
      ],
    });
    expect(rows).toEqual([]);
  });

  it('marca la inscripción secundaria y lista también la que no tiene asistencias', () => {
    const student = {
      ...maria,
      enrollments: [
        ...maria.enrollments,
        { groupId: 'MJ1724', enrollmentType: 'SECONDARY', enrolledAt: new Date('2026-10-01T00:00:00Z'), group: G.MJ1724 },
        { groupId: 'LM2222', enrollmentType: 'SECONDARY', enrolledAt: new Date('2026-10-05T00:00:00Z'), group: G.LM2222 },
      ],
    };
    const rows = buildSecondGroupRows({
      students: [student],
      records: [rec('mp', 'MJ1724', '2026-10-13', { attendanceType: 'REGULAR' })],
    });
    const mj = rows.find((r) => r.groupCode === 'MJ1724');
    const lm = rows.find((r) => r.groupCode === 'LM2222');
    expect(mj).toMatchObject({ visits: 1, enrolled: true, enrollmentType: 'SECONDARY', enrolledAt: '2026-10-01' });
    expect(lm).toMatchObject({ visits: 0, weeks: 0, firstDate: null, enrolled: true });
  });

  it('dos registros el mismo día cuentan una vez', () => {
    const rows = buildSecondGroupRows({
      students: [maria],
      records: [rec('mp', 'MJ1724', '2026-10-13'), rec('mp', 'MJ1724', '2026-10-13')],
    });
    expect(rows[0].visits).toBe(1);
  });
});
