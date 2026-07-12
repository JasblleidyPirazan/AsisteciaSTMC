import { describe, it, expect } from 'vitest';
import { notSuspended } from '../../src/lib/filters.js';

// Regresión: la forma `NOT (from <= hoy AND until >= hoy)` excluía a los
// estudiantes con fechas NULL (no suspendidos) y dejaba el roster vacío. El
// fragmento debe ser null-safe (OR con ramas para NULL).
describe('notSuspended — null-safe (no vacía el roster)', () => {
  const today = new Date('2025-06-10T00:00:00.000Z');

  it('usa OR con ramas null-safe, no NOT/AND', () => {
    const f = notSuspended(today);
    expect(f).toHaveProperty('OR');
    expect(f).not.toHaveProperty('NOT');
  });

  it('incluye a quien no tiene fecha de inicio o de fin (no suspendido)', () => {
    const f = notSuspended(today);
    expect(f.OR).toEqual(
      expect.arrayContaining([{ suspendedFrom: null }, { suspendedUntil: null }])
    );
  });

  it('incluye suspensión ya terminada (until < hoy) y aún no iniciada (from > hoy)', () => {
    const f = notSuspended(today);
    expect(f.OR).toEqual(
      expect.arrayContaining([
        { suspendedFrom: { gt: today } },
        { suspendedUntil: { lt: today } },
      ])
    );
  });
});
