import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildMakeupProgress, weekStart } = require('../../src/services/makeupProgress.js');

const L = (over = {}, rep = {}) => ({
  studentId: over.studentId || 's1', status: 'MATRICULADO', paquete: { total: 40 },
  reposicion: {
    derecho: 0, lluvia: 0, otras: 0, justificadas: 0, repuestas: 0, pendientes: 0, agendadas: 0,
    items: [], repuestasItems: [], ...rep,
  },
  ...over,
});

describe('weekStart', () => {
  it('semana de lunes a domingo', () => {
    expect(weekStart('2026-11-11')).toBe('2026-11-09'); // miércoles → lunes
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // domingo
  });
});

describe('saldo por estudiante', () => {
  it('lo que un estudiante toma de más no salda la deuda de otro', () => {
    const debe = L({ studentId: 'debe' }, { derecho: 2, lluvia: 2, pendientes: 2,
      items: [{ type: 'RAIN', date: '2026-10-05' }, { type: 'RAIN', date: '2026-10-06' }] });
    // Repuso 3 sin deber nada de reposición (recuperó festivos)
    const festivos = L({ studentId: 'fest' }, { derecho: 0, repuestas: 3,
      repuestasItems: [1, 2, 3].map((i) => ({ date: `2026-10-0${i + 5}`, units: 1, absent: false })) });
    const { weeks } = buildMakeupProgress({ ledgers: [debe, festivos], today: '2026-10-20' });
    expect(weeks.find((w) => w.weekStart === '2026-10-05')).toMatchObject({ causadas: 2, dictadas: 3, saldo: 2 });
  });
});

describe('buildMakeupProgress', () => {
  const ana = L({ studentId: 'ana' }, {
    derecho: 3, lluvia: 2, justificadas: 1, repuestas: 1, pendientes: 2, agendadas: 1,
    items: [
      { type: 'RAIN', date: '2026-10-05' }, { type: 'RAIN', date: '2026-10-07' },
      { type: 'JUSTIFIED', date: '2026-10-14' },
    ],
    repuestasItems: [{ date: '2026-10-17', units: 1, absent: false }],
  });
  // Completó su paquete con otras clases: 1 causada que ya no se repone
  const beto = L({ studentId: 'beto' }, {
    derecho: 2, otras: 2, repuestas: 1, pendientes: 0,
    items: [{ type: 'OTHER', date: '2026-10-06' }, { type: 'OTHER', date: '2026-10-06' }],
    repuestasItems: [{ date: '2026-10-24', units: 1, absent: true }],
  });
  const prueba = L({ studentId: 'p', status: 'PRUEBA' }, { derecho: 5, lluvia: 5 });
  const scheduled = [
    { studentId: 'ana', date: '2026-11-13', units: 1 },
    { studentId: 'p', date: '2026-11-13', units: 1 }, // fuera de alcance
  ];
  const { totals, weeks } = buildMakeupProgress({ ledgers: [ana, beto, prueba], scheduled, today: '2026-11-11' });

  it('totales cuadran: causadas = aplicadas + programadas + por agendar + sin reponer', () => {
    expect(totals).toMatchObject({
      students: 2, causadas: 5, lluvia: 2, otras: 2, justificadas: 1,
      dictadas: 2, asistidas: 1, perdidas: 1, aplicadas: 2,
      pendientes: 2, programadas: 1, porAgendar: 1, sinReponer: 1,
    });
    expect(totals.aplicadas + totals.programadas + totals.porAgendar + totals.sinReponer).toBe(totals.causadas);
  });
  it('deja fuera estudiantes de prueba e inactivos', () => {
    expect(totals.causadas).toBe(5);
  });
  it('reparte por semana: causadas por fecha de origen, dictadas por fecha de la reposición', () => {
    const w = Object.fromEntries(weeks.map((x) => [x.weekStart, x]));
    expect(w['2026-10-05']).toMatchObject({ lluvia: 2, otras: 2, causadas: 4, dictadas: 0, saldo: 4 });
    expect(w['2026-10-12']).toMatchObject({ justificadas: 1, causadas: 1, dictadas: 1, asistidas: 1, saldo: 4 });
    expect(w['2026-10-19']).toMatchObject({ perdidas: 1, dictadas: 1, saldo: 3 });
    // Al final cuadra con lo que se debe: pendientes (2) + ya no se reponen (1)
    expect(weeks[weeks.length - 1].saldo).toBe(totals.pendientes + totals.sinReponer);
    expect(w['2026-11-09']).toMatchObject({ programadas: 1, current: true, future: false });
    expect(weeks.map((x) => x.weekStart)).toEqual([...weeks.map((x) => x.weekStart)].sort());
  });
});
