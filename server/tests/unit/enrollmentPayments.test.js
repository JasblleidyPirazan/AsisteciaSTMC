import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parsePayments } = require('../../src/services/enrollmentImport');

// Construye un libro en memoria con una hoja "Pagos" como la del Excel real.
function bookWithPagos(rows) {
  const header = ['Id Pago', 'Estudiante', 'Cod Estudiante (COLUMNA AUTOMATICA)', 'Fecha', 'Valor Pago', 'Medio Pago', 'Ticket', 'Observaciones'];
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pagos');
  return wb;
}

// 46199 (serial Excel) → 2026-06-26
const D = 46199;

describe('parsePayments — hoja "Pagos"', () => {
  it('mapea medios de pago al enum (Datáfono → BOLD, preservando el original)', () => {
    const wb = bookWithPagos([
      ['', 'Ana', 63, D, 1394500, 'Wompi', 't1', ''],
      ['', 'Beto', 57, D, 2789000, 'Transferencia', 't2', ''],
      ['', 'Caro', 108, D, 500000, 'Datafono', 't3', 'abono'],
      ['', 'Dani', 99, D, 300000, 'Efectivo', 't4', ''],
      ['', 'Evo', 12, D, 100000, 'Rifa', 't5', ''],
    ]);
    const out = parsePayments(wb);
    expect(out).toHaveLength(5);
    expect(out.map((p) => p.method)).toEqual(['WOMPI', 'TRANSFERENCIA', 'BOLD', 'EFECTIVO', 'TRANSFERENCIA']);
    // Datáfono conserva el original en la nota, junto con la observación
    expect(out[2].note).toBe('abono · Medio: Datáfono');
    // Medio desconocido cae a TRANSFERENCIA pero deja rastro
    expect(out[4].note).toBe('Medio: Rifa');
    // Fecha y monto
    expect(out[0].amount).toBe(1394500);
    expect(out[0].paymentDate.toISOString().slice(0, 10)).toBe('2026-06-26');
    expect(out[0].code).toBe('63');
  });

  it('ignora filas sin estudiante o sin valor', () => {
    const wb = bookWithPagos([
      ['', '', 1, D, 100000, 'Wompi', '', ''],
      ['', 'Sin valor', 2, D, 0, 'Wompi', '', ''],
      ['', 'Valido', 3, D, 50000, 'Wompi', '', ''],
    ]);
    expect(parsePayments(wb)).toHaveLength(1);
  });

  it('devuelve [] si no hay hoja "Pagos"', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Otra');
    expect(parsePayments(wb)).toEqual([]);
  });
});
