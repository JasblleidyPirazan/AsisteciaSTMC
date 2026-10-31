import { describe, it, expect } from 'vitest';
import {
  upcomingSlots, canBookAt, canCancelAt, bookableCount, slotStartsAt, whatsappNumber, newToken,
  SLOT_TEMPLATES, SLOT_CAPACITY, DEFAULT_BOOKING_CONFIG, validateSlots, resolveBookingConfig,
} from '../../src/services/makeupBooking.js';

// Agendamiento público de reposiciones: turnos de 45 min viernes y sábado.
describe('turnos', () => {
  it('viernes 5:15–6:45 y sábado 1:30–3:00 dan 2 turnos de 45 min cada uno', () => {
    expect(SLOT_TEMPLATES.map((t) => `${t.weekday} ${t.start}-${t.end}`)).toEqual([
      '5 17:15-18:00', '5 18:00-18:45', '6 13:30-14:15', '6 14:15-15:00',
    ]);
    expect(SLOT_CAPACITY).toBe(6);
  });

  it('lista los turnos de los próximos 14 días, hoy incluido', () => {
    // Viernes 23 oct 2026 → vie 23, sáb 24, vie 30, sáb 31, vie 6 nov (día 14)
    const slots = upcomingSlots('2026-10-23', []);
    expect([...new Set(slots.map((s) => s.date))]).toEqual(['2026-10-23', '2026-10-24', '2026-10-30', '2026-10-31', '2026-11-06']);
    expect(slots).toHaveLength(10);
    expect(slots[0]).toMatchObject({ date: '2026-10-23', key: 'VIE-1715', weekday: 'Viernes', label: '5:15 p. m. – 6:00 p. m.' });
  });

  it('salta las fechas excluidas del semestre (festivos, recesos)', () => {
    const slots = upcomingSlots('2026-10-23', ['2026-10-31']);
    expect(slots.some((s) => s.date === '2026-10-31')).toBe(false);
    expect(slots).toHaveLength(8);
  });

  it('el turno arranca en hora de Bogotá (UTC−5)', () => {
    expect(slotStartsAt('2026-10-23', '17:15').toISOString()).toBe('2026-10-23T22:15:00.000Z');
  });
});

describe('ventanas de reserva y cancelación', () => {
  const at = (iso) => new Date(iso);
  it('se reserva hasta 2 horas antes', () => {
    expect(canBookAt(at('2026-10-23T20:15:00Z'), '2026-10-23', '17:15')).toBe(true); // 3:15 p. m.
    expect(canBookAt(at('2026-10-23T20:16:00Z'), '2026-10-23', '17:15')).toBe(false);
  });
  it('se cancela hasta 24 horas antes', () => {
    expect(canCancelAt(at('2026-10-22T22:15:00Z'), '2026-10-23', '17:15')).toBe(true);
    expect(canCancelAt(at('2026-10-22T22:16:00Z'), '2026-10-23', '17:15')).toBe(false);
  });
});

describe('cupo del estudiante', () => {
  it('puede reservar lo que debe menos lo ya agendado', () => {
    expect(bookableCount(3, 1)).toBe(2);
    expect(bookableCount(2, 2)).toBe(0);
    expect(bookableCount(1, 3)).toBe(0);
    expect(bookableCount(2.5, 0)).toBe(2); // media clase no alcanza para un turno
    expect(bookableCount(undefined, 0)).toBe(0);
  });
});

describe('utilidades del enlace', () => {
  it('número de WhatsApp: celular colombiano con 57', () => {
    expect(whatsappNumber('300 123 4567')).toBe('573001234567');
    expect(whatsappNumber('+57 300-123-4567')).toBe('573001234567');
    expect(whatsappNumber('')).toBeNull();
  });
  it('el código del enlace es largo y distinto cada vez', () => {
    const a = newToken();
    expect(a.length).toBeGreaterThanOrEqual(24);
    expect(a).not.toBe(newToken());
  });
});

describe('reglas configurables desde Configuración', () => {
  it('sin nada guardado quedan las reglas por defecto', () => {
    expect(resolveBookingConfig([])).toEqual(DEFAULT_BOOKING_CONFIG);
  });

  it('usa lo guardado: turnos, cupo, horizonte y cortes', () => {
    const cfg = resolveBookingConfig([
      { key: 'makeup_slots', value: JSON.stringify([{ weekday: 3, start: '16:00', end: '16:45' }]) },
      { key: 'makeup_capacity', value: '4' },
      { key: 'makeup_horizon_days', value: '21' },
      { key: 'makeup_book_cutoff_hours', value: '1' },
      { key: 'makeup_cancel_cutoff_hours', value: '12' },
    ]);
    expect(cfg).toMatchObject({ capacity: 4, horizonDays: 21, bookCutoffHours: 1, cancelCutoffHours: 12 });
    expect(cfg.slots).toEqual([{ key: 'MIE-1600', weekday: 3, start: '16:00', end: '16:45' }]);
  });

  it('valores inválidos o dañados caen al valor por defecto', () => {
    const cfg = resolveBookingConfig([
      { key: 'makeup_slots', value: 'no es json' },
      { key: 'makeup_capacity', value: '0' },
      { key: 'makeup_horizon_days', value: 'abc' },
      { key: 'makeup_cancel_cutoff_hours', value: '9999' },
    ]);
    expect(cfg).toEqual(DEFAULT_BOOKING_CONFIG);
  });

  it('validateSlots rechaza días, horas y duplicados inválidos', () => {
    expect(validateSlots([]).error).toBeTruthy();
    expect(validateSlots([{ weekday: 9, start: '10:00', end: '11:00' }]).error).toBeTruthy();
    expect(validateSlots([{ weekday: 1, start: '25:00', end: '26:00' }]).error).toBeTruthy();
    expect(validateSlots([{ weekday: 1, start: '11:00', end: '10:00' }]).error).toBeTruthy();
    expect(validateSlots([{ weekday: 1, start: '10:00', end: '11:00' }, { weekday: 1, start: '10:00', end: '10:45' }]).error).toMatch(/repetido/);
  });

  it('los turnos configurados alimentan upcomingSlots y los cortes a canBookAt/canCancelAt', () => {
    const { slots } = validateSlots([{ weekday: 5, start: '09:00', end: '09:45' }]);
    const out = upcomingSlots('2026-10-23', [], 7, slots);
    expect(out.map((x) => `${x.date} ${x.key}`)).toEqual(['2026-10-23 VIE-0900', '2026-10-30 VIE-0900']);
    const now = new Date('2026-10-23T12:00:00-05:00'); // 21 h antes de las 9:00 del sábado... (turno vie 23 ya pasó)
    expect(canBookAt(now, '2026-10-24', '09:00', 30)).toBe(false);
    expect(canBookAt(now, '2026-10-24', '09:00', 2)).toBe(true);
    expect(canCancelAt(now, '2026-10-24', '09:00', 12)).toBe(true);
  });
});
