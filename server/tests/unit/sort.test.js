import { describe, it, expect } from 'vitest';
import { compareCodes, byGroupCode } from '../../src/lib/sort.js';

describe('compareCodes (orden alfanumérico natural)', () => {
  it('ordena números dentro del texto de forma natural (G2 < G10)', () => {
    const codes = ['G10', 'G2', 'G1', 'G21', 'G3'];
    expect([...codes].sort(compareCodes)).toEqual(['G1', 'G2', 'G3', 'G10', 'G21']);
  });

  it('ignora mayúsculas/minúsculas', () => {
    expect([...['b2', 'A10', 'a2']].sort(compareCodes)).toEqual(['a2', 'A10', 'b2']);
  });

  it('tolera null/undefined sin lanzar', () => {
    expect(() => compareCodes(null, undefined)).not.toThrow();
    expect(compareCodes(null, 'A1')).toBeLessThan(0); // '' antes que 'A1'
  });

  it('byGroupCode ordena objetos grupo por su code', () => {
    const groups = [{ code: 'MAR-10' }, { code: 'MAR-2' }, { code: 'LUN-1' }];
    expect(groups.sort(byGroupCode).map((g) => g.code)).toEqual(['LUN-1', 'MAR-2', 'MAR-10']);
  });
});
