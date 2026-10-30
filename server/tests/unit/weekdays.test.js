import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { groupWeekdays, storedWeekdays, normalizeWeekdays, parseDayLetters } = require('../../src/lib/weekdays');
const { parseRecords, enrollmentWeekdays } = require('../../src/services/enrollmentImport');

// Grupo de lunes, miércoles y viernes
const LMV = { code: 'LMV1', lunes: true, miercoles: true, viernes: true };

describe('groupWeekdays / storedWeekdays', () => {
  it('lista los días del grupo como números de getUTCDay()', () => {
    expect(groupWeekdays(LMV)).toEqual([1, 3, 5]);
    expect(groupWeekdays({ sabado: true, domingo: true })).toEqual([0, 6]);
  });
  it('null o lista vacía = todos los días del grupo', () => {
    expect(storedWeekdays(null)).toBeNull();
    expect(storedWeekdays([])).toBeNull();
    expect(storedWeekdays([5, 1])).toEqual([1, 5]);
  });
});

describe('normalizeWeekdays — validación contra el horario del grupo', () => {
  it('sin días → todos (null)', () => {
    expect(normalizeWeekdays(undefined, LMV)).toEqual({ value: null });
    expect(normalizeWeekdays(null, LMV)).toEqual({ value: null });
  });
  it('acepta un subconjunto de los días del grupo, ordenado y sin repetidos', () => {
    expect(normalizeWeekdays([5, 1, 1], LMV)).toEqual({ value: [1, 5] });
    expect(normalizeWeekdays(['3'], LMV)).toEqual({ value: [3] });
  });
  it('todos los días del grupo equivale a null', () => {
    expect(normalizeWeekdays([1, 3, 5], LMV)).toEqual({ value: null });
  });
  it('rechaza un día que el grupo no tiene, nombrándolo', () => {
    const r = normalizeWeekdays([1, 2], LMV);
    expect(r.error).toMatch(/LMV1/);
    expect(r.error).toMatch(/martes/);
  });
  it('rechaza lista vacía, no-lista y valores fuera de 0–6', () => {
    expect(normalizeWeekdays([], LMV).error).toMatch(/al menos un día/i);
    expect(normalizeWeekdays('1,3', LMV).error).toBeTruthy();
    expect(normalizeWeekdays([7], LMV).error).toBeTruthy();
    expect(normalizeWeekdays([1.5], LMV).error).toBeTruthy();
    expect(normalizeWeekdays(['x'], LMV).error).toBeTruthy();
  });
});

describe('parseDayLetters — columna "Días" del Excel', () => {
  it('L M X J V S D → 1 2 3 4 5 6 0', () => {
    expect(parseDayLetters('L,M,X,J,V,S,D').days).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('acepta separadores varios y minúsculas', () => {
    expect(parseDayLetters('l-x-v').days).toEqual([1, 3, 5]);
    expect(parseDayLetters('L X V').days).toEqual([1, 3, 5]);
    expect(parseDayLetters('L / V').days).toEqual([1, 5]);
  });
  it('acepta las letras pegadas', () => {
    expect(parseDayLetters('LXV').days).toEqual([1, 3, 5]);
  });
  it('vacío → null (todos); letras desconocidas se reportan', () => {
    expect(parseDayLetters('')).toEqual({ days: null, invalid: [] });
    expect(parseDayLetters(null)).toEqual({ days: null, invalid: [] });
    expect(parseDayLetters('L,Z')).toEqual({ days: [1], invalid: ['Z'] });
  });
});

describe('importación: columna "Días" del estudiante', () => {
  const HEADER = ['ID', 'NOMBRE COMPLETO', 'CÓDIGO GRUPO', 'NIVEL', 'PROFESOR', 'HORARIO', 'DÍAS', 'Documento',
    'Fecha de nacimiento', 'Número de WA', 'Acudiente', 'Correo electrónico', 'Fecha de inicio', 'Estado de pago', 'Clases canceladas'];
  const book = (header, rows) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Consolidado Matrícula');
    return wb;
  };
  const row = (extra = []) => ['1', 'Ana Pérez', 'LMV1', 'Verde A', 'Profe', '4:00 PM - 5:00 PM', 'L,X,V', '123', '', '', '', '', '', 0, 40, ...extra];

  it('con la columna: lee los días del estudiante (distinta de "DÍAS", el horario del grupo)', () => {
    const [r] = parseRecords(book([...HEADER, 'Días'], [row(['L'])]));
    expect(r.dias).toBe('L,X,V');         // horario del grupo
    expect(r.weekdaysText).toBe('L');     // días que toma el estudiante
  });
  it('sin la columna: no hay días de estudiante (todos)', () => {
    const [r] = parseRecords(book(HEADER, [row()]));
    expect(r.weekdaysText).toBeNull();
    expect(enrollmentWeekdays(r, LMV)).toBeNull();
  });
  it('celda vacía → todos los días del grupo', () => {
    const [r] = parseRecords(book([...HEADER, 'Días'], [row([''])]));
    expect(enrollmentWeekdays(r, LMV)).toBeNull();
  });
  it('días válidos → lista; todos los del grupo → null', () => {
    expect(enrollmentWeekdays({ name: 'A', code: 'LMV1', weekdaysText: 'L,V' }, LMV)).toEqual([1, 5]);
    expect(enrollmentWeekdays({ name: 'A', code: 'LMV1', weekdaysText: 'L,X,V' }, LMV)).toBeNull();
  });
  it('un día que el grupo no tiene deja aviso y queda con todos los días', () => {
    const warnings = [];
    expect(enrollmentWeekdays({ name: 'Ana', code: 'LMV1', weekdaysText: 'M' }, LMV, warnings)).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Ana/);
    expect(warnings[0]).toMatch(/martes/);
  });
  it('letras desconocidas dejan aviso', () => {
    const warnings = [];
    expect(enrollmentWeekdays({ name: 'Ana', code: 'LMV1', weekdaysText: 'L,Q' }, LMV, warnings)).toEqual([1]);
    expect(warnings[0]).toMatch(/Q/);
  });
});
