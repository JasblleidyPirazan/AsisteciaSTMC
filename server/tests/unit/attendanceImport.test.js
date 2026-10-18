import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import XLSX from 'xlsx';

const require = createRequire(import.meta.url);
const {
  parseAttendanceRows, planClasses, pickStudent, normMark, normDate,
} = require('../../src/services/attendanceImport.js');

function xlsxBuffer(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'asistencia');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const HEADER = ['Fecha', 'Grupo', 'Estudiante', 'Código', 'Marca', 'Detalle', 'Profesor', 'Asistente'];

describe('normMark / normDate', () => {
  it('mapea P/A/J/NA (y variantes de N/A)', () => {
    expect(normMark('P')).toBe('PRESENTE');
    expect(normMark('a')).toBe('AUSENTE');
    expect(normMark('J')).toBe('JUSTIFICADA');
    expect(normMark('NA')).toBe('NO_APLICA');
    expect(normMark('N/A')).toBe('NO_APLICA');
    expect(normMark('X')).toBeNull();
  });

  it('acepta ISO, dd/mm/yyyy y fechas de Excel', () => {
    expect(normDate('2026-10-17')).toBe('2026-10-17');
    expect(normDate('7/10/2026')).toBe('2026-10-07');
    expect(normDate(new Date('2026-10-13T00:00:00Z'))).toBe('2026-10-13');
    expect(normDate('ayer')).toBeNull();
  });
});

describe('parseAttendanceRows + planClasses', () => {
  const buffer = xlsxBuffer([
    HEADER,
    ['2026-10-14', 'LM1332', 'Emiliano Valencia', 'EV02', 'P', 'repone de LM1543', 'Wilman Jimenez', 'Santiago Mera'],
    ['2026-10-14', 'LM1332', 'Emilio Penagos', 'EP01', 'A', null, null, null],
    ['2026-10-14', 'LM1332', 'Pedro Penagos', 'PP01', 'P', null, null, null],
    ['2026-10-15', 'MJ1924', 'Martina Quintero', 'MQ01', 'NA', null, null, null],
    ['2026-10-17', 'REP', 'Jacobo Valencia', 'JV01', 'P', 'repone de LM1543 · reposición grupal', null, null],
  ]);

  it('lee las filas con sus columnas opcionales', () => {
    const rows = parseAttendanceRows(buffer);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      date: '2026-10-14', groupCode: 'LM1332', studentName: 'Emiliano Valencia', status: 'PRESENTE',
      professorName: 'Wilman Jimenez', assistantName: 'Santiago Mera', line: 2,
    });
  });

  it('agrupa por fecha+grupo; "repone" → REPOSICION; REP → reposición grupal', () => {
    const classes = planClasses(parseAttendanceRows(buffer));
    expect(classes.map((c) => `${c.date} ${c.groupCode}`)).toEqual([
      '2026-10-14 LM1332', '2026-10-15 MJ1924', '2026-10-17 REP',
    ]);
    const lm = classes[0];
    expect(lm.professorName).toBe('Wilman Jimenez');
    expect(lm.assistantName).toBe('Santiago Mera');
    expect(lm.rows.map((r) => r.attendanceType)).toEqual(['REPOSICION', 'REGULAR', 'REGULAR']);
    expect(lm.rows[0].originGroupCode).toBe('LM1543');
    expect(lm.errors).toEqual([]);
    const rep = classes[2];
    expect(rep.isMakeup).toBe(true);
    // En la reposición grupal todos son participantes regulares
    expect(rep.rows[0].attendanceType).toBe('REGULAR');
  });

  it('marca errores: marca inválida, estudiante repetido, dos profesores', () => {
    const classes = planClasses(parseAttendanceRows(xlsxBuffer([
      HEADER,
      ['2026-10-13', 'MJ1524', 'Ana', null, 'Z', null, 'Prof Uno', null],
      ['2026-10-13', 'MJ1524', 'Ana', null, 'P', null, 'Prof Dos', null],
    ])));
    const errs = classes[0].errors.join(' | ');
    expect(errs).toMatch(/marca "Z" no válida/);
    expect(errs).toMatch(/Ana aparece dos veces/);
    expect(errs).toMatch(/Más de un profesor/);
  });

  it('sin encabezados obligatorios → error legible', () => {
    expect(() => parseAttendanceRows(xlsxBuffer([['Estudiante', 'Grupo'], ['Ana', 'G1']])))
      .toThrow(/encabezados/);
  });
});

describe('pickStudent (homónimos)', () => {
  const a = { id: 'a', active: true, enrollments: [{ groupId: 'g1' }] };
  const b = { id: 'b', active: true, enrollments: [{ groupId: 'g2' }] };
  const c = { id: 'c', active: false, enrollments: [{ groupId: 'g1' }] };

  it('uno solo → ese', () => expect(pickStudent([a], [])).toBe(a));
  it('prefiere el activo', () => expect(pickStudent([a, c], [])).toBe(a));
  it('dos activos → el inscrito en el grupo de la clase', () => expect(pickStudent([a, b], ['g2'])).toBe(b));
  it('dos activos sin pista → null (ambiguo)', () => expect(pickStudent([a, b], ['g9'])).toBeNull());
});
