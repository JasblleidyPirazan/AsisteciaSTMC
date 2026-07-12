import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getBracketRate,
  getPeriodForDate,
  getCurrentPeriod,
} from '../../src/services/costEngine.js';

// Realistic tariff config (values arrive from SystemConfig as strings)
const cfg = {
  rate_2_students: '30000',
  rate_3_students: '45000',
  rate_4_students: '60000',
  rate_5plus_students: '75000',
};

describe('getBracketRate — tarifa por tramo', () => {
  it('paga 0 cuando no hay presentes', () => {
    expect(getBracketRate(0, cfg)).toBe(0);
    expect(getBracketRate(-3, cfg)).toBe(0);
  });

  it('tramo 1-2 → rate_2_students', () => {
    expect(getBracketRate(1, cfg)).toBe(30000);
    expect(getBracketRate(2, cfg)).toBe(30000);
  });

  it('tramo 3 → rate_3_students', () => {
    expect(getBracketRate(3, cfg)).toBe(45000);
  });

  it('tramo 4 → rate_4_students', () => {
    expect(getBracketRate(4, cfg)).toBe(60000);
  });

  it('tramo 5+ → rate_5plus_students', () => {
    expect(getBracketRate(5, cfg)).toBe(75000);
    expect(getBracketRate(9, cfg)).toBe(75000);
  });

  it('la tarifa es plana por sesión, no por estudiante (5 y 8 pagan igual)', () => {
    expect(getBracketRate(5, cfg)).toBe(getBracketRate(8, cfg));
  });

  it('usa valores por defecto cuando la config no trae la clave', () => {
    expect(getBracketRate(2, {})).toBe(30000);
    expect(getBracketRate(3, {})).toBe(45000);
    expect(getBracketRate(4, {})).toBe(60000);
    expect(getBracketRate(6, {})).toBe(75000);
  });

  it('parsea tarifas numéricas o string por igual', () => {
    expect(getBracketRate(3, { rate_3_students: 50000 })).toBe(50000);
    expect(getBracketRate(3, { rate_3_students: '50000' })).toBe(50000);
  });
});

describe('getPeriodForDate — quincenas', () => {
  it('días 1-15 → primera quincena (half 1)', () => {
    expect(getPeriodForDate(new Date(2025, 5, 1))).toBe('2025-06-1');
    expect(getPeriodForDate(new Date(2025, 5, 15))).toBe('2025-06-1');
  });

  it('días 16-fin → segunda quincena (half 2)', () => {
    expect(getPeriodForDate(new Date(2025, 5, 16))).toBe('2025-06-2');
    expect(getPeriodForDate(new Date(2025, 5, 30))).toBe('2025-06-2');
  });

  it('el mes va con dos dígitos', () => {
    expect(getPeriodForDate(new Date(2025, 0, 5))).toBe('2025-01-1');
    expect(getPeriodForDate(new Date(2025, 11, 20))).toBe('2025-12-2');
  });
});

describe('getCurrentPeriod — formato', () => {
  afterEach(() => vi.useRealTimers());

  it('devuelve la quincena de "ahora" con formato YYYY-MM-[12]', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 10, 12, 0, 0)); // 10 jul → half 1
    expect(getCurrentPeriod()).toBe('2025-07-1');

    vi.setSystemTime(new Date(2025, 6, 25, 12, 0, 0)); // 25 jul → half 2
    expect(getCurrentPeriod()).toBe('2025-07-2');
  });
});
