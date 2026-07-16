// mockPrisma primero: services/studentStatus.js hace require('../lib/prisma')
// (solo lo usan los helpers async; aquí probamos la lógica pura).
import '../helpers/mockPrisma.js';
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  ageOn,
  priceCategory,
  expectedTotal,
  deriveStudentStatus,
  decorateStudent,
  stripTuition,
  TUITION_DEFAULTS,
} = require('../../src/services/studentStatus.js');

const TODAY = new Date('2026-07-16T00:00:00.000Z');
const base = {
  id: 's1', active: true, isTrial: false,
  suspendedFrom: null, suspendedUntil: null,
  birthDate: new Date('2010-03-01'), // 16 años → PEQUEÑO
  classesAcquired: 40,
};

describe('ageOn / priceCategory', () => {
  it('calcula la edad en años cumplidos', () => {
    expect(ageOn(new Date('2010-03-01'), TODAY)).toBe(16);
    expect(ageOn(new Date('2010-08-01'), TODAY)).toBe(15); // aún no cumple
    expect(ageOn(null, TODAY)).toBeNull();
  });

  it('categoriza ADULTO desde tuition_adult_age (18) y PEQUENO por debajo', () => {
    expect(priceCategory({ birthDate: new Date('1990-01-01') }, TUITION_DEFAULTS, TODAY)).toBe('ADULTO');
    expect(priceCategory({ birthDate: new Date('2008-07-16') }, TUITION_DEFAULTS, TODAY)).toBe('ADULTO'); // cumple 18 hoy
    expect(priceCategory({ birthDate: new Date('2010-03-01') }, TUITION_DEFAULTS, TODAY)).toBe('PEQUENO');
    expect(priceCategory({ birthDate: null }, TUITION_DEFAULTS, TODAY)).toBeNull();
  });
});

describe('expectedTotal — valor del plan', () => {
  it('adulto: 40 clases = 2.789.000; prorratea por clases adquiridas', () => {
    expect(expectedTotal({ birthDate: new Date('1990-01-01'), classesAcquired: 40 }, TUITION_DEFAULTS, TODAY)).toBe(2789000);
    expect(expectedTotal({ birthDate: new Date('1990-01-01'), classesAcquired: 20 }, TUITION_DEFAULTS, TODAY)).toBe(1394500);
  });

  it('pequeño: 40 clases = 2.425.000', () => {
    expect(expectedTotal(base, TUITION_DEFAULTS, TODAY)).toBe(2425000);
    expect(expectedTotal({ ...base, classesAcquired: 10 }, TUITION_DEFAULTS, TODAY)).toBe(606250);
  });

  it('null sin fecha de nacimiento o sin clases adquiridas', () => {
    expect(expectedTotal({ ...base, birthDate: null }, TUITION_DEFAULTS, TODAY)).toBeNull();
    expect(expectedTotal({ ...base, classesAcquired: 0 }, TUITION_DEFAULTS, TODAY)).toBeNull();
  });
});

describe('deriveStudentStatus — prioridad de estados', () => {
  const opts = (extra = {}) => ({ cfg: TUITION_DEFAULTS, today: TODAY, ...extra });

  it('INACTIVO si está desactivado (gana a todo)', () => {
    expect(deriveStudentStatus({ ...base, active: false, isTrial: true }, opts())).toBe('INACTIVO');
  });

  it('SUSPENDIDO si hoy cae dentro del rango', () => {
    const s = { ...base, suspendedFrom: new Date('2026-07-01'), suspendedUntil: new Date('2026-07-31') };
    expect(deriveStudentStatus(s, opts())).toBe('SUSPENDIDO');
    const past = { ...base, suspendedFrom: new Date('2026-01-01'), suspendedUntil: new Date('2026-02-01') };
    expect(deriveStudentStatus(past, opts({ totalPaid: 0 }))).toBe('PREINSCRITO');
  });

  it('PRUEBA para estudiantes de clase de prueba', () => {
    expect(deriveStudentStatus({ ...base, isTrial: true }, opts())).toBe('PRUEBA');
  });

  it('PREINSCRITO: registrado sin asistencia ni pagos', () => {
    expect(deriveStudentStatus(base, opts())).toBe('PREINSCRITO');
  });

  it('INSCRITO con algún pago o alguna asistencia', () => {
    expect(deriveStudentStatus(base, opts({ totalPaid: 100000 }))).toBe('INSCRITO');
    expect(deriveStudentStatus(base, opts({ hasAttendance: true }))).toBe('INSCRITO');
  });

  it('MATRICULADO cuando lo pagado cubre el valor del plan', () => {
    expect(deriveStudentStatus(base, opts({ totalPaid: 2425000 }))).toBe('MATRICULADO');
    expect(deriveStudentStatus(base, opts({ totalPaid: 2424999 }))).toBe('INSCRITO'); // falta $1
    // Plan parcial: 10 clases de pequeño = 606.250
    expect(deriveStudentStatus({ ...base, classesAcquired: 10 }, opts({ totalPaid: 606250 }))).toBe('MATRICULADO');
  });

  it('sin fecha de nacimiento NUNCA llega a MATRICULADO (no hay tarifa)', () => {
    const s = { ...base, birthDate: null };
    expect(deriveStudentStatus(s, opts({ totalPaid: 99999999 }))).toBe('INSCRITO');
  });

  it('sin clases adquiridas no hay plan → no puede ser MATRICULADO', () => {
    const s = { ...base, classesAcquired: 0 };
    expect(deriveStudentStatus(s, opts({ totalPaid: 5000000 }))).toBe('INSCRITO');
  });
});

describe('decorateStudent — missingBirthDate y tuition', () => {
  it('marca error solo a regulares activos sin fecha de nacimiento', () => {
    expect(decorateStudent({ ...base, birthDate: null }, { cfg: TUITION_DEFAULTS, today: TODAY }).missingBirthDate).toBe(true);
    expect(decorateStudent(base, { cfg: TUITION_DEFAULTS, today: TODAY }).missingBirthDate).toBe(false);
    expect(decorateStudent({ ...base, birthDate: null, isTrial: true }, { cfg: TUITION_DEFAULTS, today: TODAY }).missingBirthDate).toBe(false);
    expect(decorateStudent({ ...base, birthDate: null, active: false }, { cfg: TUITION_DEFAULTS, today: TODAY }).missingBirthDate).toBe(false);
  });

  it('expone categoría, esperado, pagado y saldo', () => {
    const d = decorateStudent(base, { totalPaid: 1000000, cfg: TUITION_DEFAULTS, today: TODAY });
    expect(d.tuition).toEqual({ category: 'PEQUENO', expectedTotal: 2425000, totalPaid: 1000000, balance: 1425000 });
    // Pago de más no genera saldo negativo
    const over = decorateStudent(base, { totalPaid: 3000000, cfg: TUITION_DEFAULTS, today: TODAY });
    expect(over.tuition.balance).toBe(0);
    expect(over.studentStatus).toBe('MATRICULADO');
  });
});

describe('stripTuition — montos solo para roles con acceso económico', () => {
  const list = [{ id: 's1', studentStatus: 'INSCRITO', tuition: { totalPaid: 1 } }];
  it('conserva tuition para ADMIN/SUPERADMIN/RECEPTION', () => {
    for (const role of ['ADMIN', 'SUPERADMIN', 'RECEPTION']) {
      expect(stripTuition(list, role)[0].tuition).toBeDefined();
    }
  });
  it('lo elimina para TEACHER/ASSISTANT/PHYSICAL_TRAINER/PARENT (sin excepción)', () => {
    for (const role of ['TEACHER', 'ASSISTANT', 'PHYSICAL_TRAINER', 'PARENT']) {
      const out = stripTuition(list, role);
      expect(out[0].tuition).toBeUndefined();
      expect(out[0].studentStatus).toBe('INSCRITO'); // el estado sí viaja
    }
  });
  it('respeta la lista de excepciones (PARENT viendo a su propio hijo)', () => {
    expect(stripTuition(list, 'PARENT', ['PARENT'])[0].tuition).toBeDefined();
  });
});
