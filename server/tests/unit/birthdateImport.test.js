// mockPrisma primero: importBirthDates usa prisma (inyección en require.cache).
import { prismaMock, resetPrisma } from '../helpers/mockPrisma.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import XLSX from 'xlsx';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseBirthDates, importBirthDates } = require('../../src/services/enrollmentImport');

// Hoja como "PRE-INSCRITOS" del Excel real de inscripciones (fechas en serial).
function bookWithBirthdates(rows, sheetName = 'PRE-INSCRITOS') {
  const header = ['COD ESTUDIANTE', 'TIPO DOC', 'DOC IDENTIDAD', 'NOMBRE COMPLETO', 'FECHA DE NACIMIENTO', 'EDAD'];
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

// 41214 (serial Excel) → 2012-11-01
const BD = 41214;

describe('parseBirthDates — hojas con FECHA DE NACIMIENTO', () => {
  it('extrae documento, nombre y fecha; ignora filas sin fecha', () => {
    const wb = bookWithBirthdates([
      ['A1', 'TI', 1035000810, 'LUCIANA LOZADA ROLDAN', BD, 13],
      ['A2', 'TI', 999, 'SIN FECHA', '', 10],
    ]);
    const out = parseBirthDates(wb);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ document: '1035000810', name: 'LUCIANA LOZADA ROLDAN' });
    expect(out[0].birthDate.toISOString().slice(0, 10)).toBe('2012-11-01');
  });

  it('dedupe por documento entre hojas repetidas', () => {
    const wb = bookWithBirthdates([['A1', 'TI', 123, 'ANA', BD, 13]]);
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['DOC IDENTIDAD', 'NOMBRE COMPLETO', 'FECHA DE NACIMIENTO'],
      [123, 'ANA', BD + 100],
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, 'EnvíoCorreos');
    const out = parseBirthDates(wb);
    expect(out).toHaveLength(1);
    expect(out[0].birthDate.toISOString().slice(0, 10)).toBe('2012-11-01'); // gana la primera hoja
  });

  it('descarta fechas implausibles (seriales corruptos)', () => {
    const wb = bookWithBirthdates([['A1', 'TI', 123, 'ANA', 999999, 13]]);
    expect(parseBirthDates(wb)).toHaveLength(0);
  });

  it('devuelve [] si ninguna hoja trae las columnas', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Otra');
    expect(parseBirthDates(wb)).toEqual([]);
  });
});

describe('importBirthDates — backfill sobre estudiantes existentes', () => {
  beforeEach(() => {
    resetPrisma();
    prismaMock.student = {
      findMany: vi.fn().mockResolvedValue([
        { id: 's1', name: 'Luciana Lozada Roldan', document: '1035000810', birthDate: null },
        { id: 's2', name: 'PEDRO PEREZ', document: null, birthDate: null },
        { id: 's3', name: 'CON FECHA', document: '777', birthDate: new Date('2000-01-01') },
      ]),
      update: vi.fn().mockResolvedValue({}),
    };
  });

  const entries = [
    { document: '1035000810', name: 'LUCIANA LOZADA ROLDAN', birthDate: new Date('2012-11-01') }, // por documento
    { document: null, name: '  pedro   perez ', birthDate: new Date('2013-05-05') },              // por nombre normalizado
    { document: '777', name: 'CON FECHA', birthDate: new Date('1999-09-09') },                    // ya tiene → no se toca
    { document: '000', name: 'NADIE', birthDate: new Date('2010-01-01') },                        // no existe
  ];

  it('rellena solo las fechas faltantes, empareja por documento o nombre', async () => {
    const r = await importBirthDates(entries, { dryRun: false });
    expect(r.counts).toMatchObject({ rows: 4, matched: 3, filled: 2, alreadySet: 1, unmatched: 1 });
    expect(prismaMock.student.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.student.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { birthDate: new Date('2012-11-01') } });
    expect(prismaMock.student.update).toHaveBeenCalledWith({ where: { id: 's2' }, data: { birthDate: new Date('2013-05-05') } });
    expect(r.warnings[0]).toMatch(/NADIE/);
  });

  it('dryRun no escribe nada pero reporta lo que haría', async () => {
    const r = await importBirthDates(entries, { dryRun: true });
    expect(r.counts.toFill).toBe(2);
    expect(r.counts.filled).toBe(0);
    expect(prismaMock.student.update).not.toHaveBeenCalled();
  });
});
