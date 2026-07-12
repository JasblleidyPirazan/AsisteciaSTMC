import { describe, it, expect, vi, afterEach } from 'vitest';
import { bogotaDateStr, dbDateStr, bogotaToday } from '../../src/lib/dates.js';

describe('dbDateStr — YYYY-MM-DD de una columna @db.Date (UTC midnight)', () => {
  it('extrae la fecha del instante UTC', () => {
    expect(dbDateStr(new Date('2025-06-10T00:00:00.000Z'))).toBe('2025-06-10');
  });

  it('acepta strings y objetos Date', () => {
    expect(dbDateStr('2025-01-05T00:00:00.000Z')).toBe('2025-01-05');
    expect(dbDateStr(new Date('2025-12-31T00:00:00.000Z'))).toBe('2025-12-31');
  });
});

describe('bogotaDateStr — YYYY-MM-DD visto en America/Bogota (UTC-5)', () => {
  it('convierte a la zona de Bogotá antes de cortar la fecha', () => {
    // 2025-06-11 02:00 UTC = 2025-06-10 21:00 en Bogotá → el día sigue siendo el 10
    expect(bogotaDateStr(new Date('2025-06-11T02:00:00.000Z'))).toBe('2025-06-10');
  });

  it('un instante ya dentro del día en Bogotá conserva la fecha', () => {
    // 2025-06-11 10:00 UTC = 2025-06-11 05:00 Bogotá
    expect(bogotaDateStr(new Date('2025-06-11T10:00:00.000Z'))).toBe('2025-06-11');
  });
});

describe('bogotaToday — Date a UTC midnight del "hoy" de Bogotá', () => {
  afterEach(() => vi.useRealTimers());

  it('devuelve el día de Bogotá aunque en UTC ya sea el siguiente', () => {
    vi.useFakeTimers();
    // 2025-06-11 03:00 UTC → 2025-06-10 22:00 Bogotá → hoy = 2025-06-10
    vi.setSystemTime(new Date('2025-06-11T03:00:00.000Z'));
    expect(bogotaToday().toISOString()).toBe('2025-06-10T00:00:00.000Z');
  });
});
