import { describe, it, expect, vi, afterEach } from 'vitest';
import { bogotaDateStr, dbDateStr, bogotaToday, bogotaDayOfWeek, bogotaMinutesOfDay } from '../../src/lib/dates.js';

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

describe('bogotaDayOfWeek — día de la semana del "hoy" de Bogotá', () => {
  afterEach(() => vi.useRealTimers());

  it('tras las 7 p. m. de Bogotá, UTC ya va en mañana pero el día sigue siendo el de Bogotá', () => {
    vi.useFakeTimers();
    // 2025-06-11 (miércoles) 01:00 UTC = martes 10 de junio, 20:00 en Bogotá
    vi.setSystemTime(new Date('2025-06-11T01:00:00.000Z'));
    expect(bogotaDayOfWeek()).toBe(2); // martes
  });
});

describe('bogotaMinutesOfDay — minutos del día en hora de Bogotá', () => {
  it('convierte el instante a la hora local de Bogotá (UTC-5)', () => {
    // 20:45 UTC = 15:45 Bogotá → 15*60+45
    expect(bogotaMinutesOfDay(new Date('2025-06-10T20:45:00.000Z'))).toBe(15 * 60 + 45);
  });

  it('cruza la medianoche UTC sin cambiar de día local', () => {
    // 00:30 UTC del día 11 = 19:30 Bogotá del día 10
    expect(bogotaMinutesOfDay(new Date('2025-06-11T00:30:00.000Z'))).toBe(19 * 60 + 30);
  });
});
