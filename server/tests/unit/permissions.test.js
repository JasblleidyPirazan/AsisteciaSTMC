import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { canReport } = require('../../src/lib/permissions');

const u = (role) => ({ id: 'u1', role });
const REGULAR = { kind: 'REGULAR', group: { professorId: 'p1' } };
const MAKEUP = { kind: 'MAKEUP', makeupProfessorId: 'p1', substituteProfessorId: 'p2' };
const FESTIVAL = { kind: 'FESTIVAL' };

describe('canReport — quién puede reportar cada tipo de sesión', () => {
  it('SUPERADMIN siempre (incluida una reposición: antes recibía 403)', () => {
    for (const s of [REGULAR, MAKEUP, FESTIVAL]) expect(canReport(u('SUPERADMIN'), s)).toBe(true);
  });

  it('PHYSICAL_TRAINER (Coordinador) siempre', () => {
    for (const s of [REGULAR, MAKEUP, FESTIVAL]) expect(canReport(u('PHYSICAL_TRAINER'), s)).toBe(true);
  });

  it('ADMIN solo MAKEUP y FESTIVAL; en clases regulares es solo-lectura', () => {
    expect(canReport(u('ADMIN'), REGULAR)).toBe(false);
    expect(canReport(u('ADMIN'), MAKEUP)).toBe(true);
    expect(canReport(u('ADMIN'), FESTIVAL)).toBe(true);
  });

  it('el tipo por defecto es REGULAR', () => {
    expect(canReport(u('ADMIN'), {})).toBe(false);
    expect(canReport(u('SUPERADMIN'), undefined)).toBe(true);
  });

  describe('TEACHER', () => {
    it('REGULAR: solo si es el titular del grupo', () => {
      expect(canReport(u('TEACHER'), REGULAR, 'p1')).toBe(true);
      expect(canReport(u('TEACHER'), REGULAR, 'p9')).toBe(false);
    });
    it('REGULAR: acepta el titular como groupProfessorId (clase que aún no existe)', () => {
      expect(canReport(u('TEACHER'), { kind: 'REGULAR', groupProfessorId: 'p1' }, 'p1')).toBe(true);
      expect(canReport(u('TEACHER'), { kind: 'REGULAR', groupProfessorId: 'p1' }, 'p9')).toBe(false);
    });
    it('MAKEUP: el profesor asignado o el sustituto', () => {
      expect(canReport(u('TEACHER'), MAKEUP, 'p1')).toBe(true);
      expect(canReport(u('TEACHER'), MAKEUP, 'p2')).toBe(true);
      expect(canReport(u('TEACHER'), MAKEUP, 'p9')).toBe(false);
    });
    it('FESTIVAL: nunca (lo reporta el coordinador)', () => {
      expect(canReport(u('TEACHER'), FESTIVAL, 'p1')).toBe(false);
    });
    it('sin profesor vinculado: nunca', () => {
      for (const s of [REGULAR, MAKEUP, FESTIVAL]) {
        expect(canReport(u('TEACHER'), s, null)).toBe(false);
        expect(canReport(u('TEACHER'), s)).toBe(false);
      }
    });
    it('un grupo o reposición sin profesor no le da permiso a quien tampoco tiene (undefined ≠ undefined)', () => {
      expect(canReport(u('TEACHER'), { kind: 'REGULAR' }, 'p1')).toBe(false);
      expect(canReport(u('TEACHER'), { kind: 'MAKEUP' }, 'p1')).toBe(false);
    });
  });

  it('nadie más: ASSISTANT, PARENT, RECEPTION, sin rol', () => {
    for (const role of ['ASSISTANT', 'PARENT', 'RECEPTION', undefined]) {
      for (const s of [REGULAR, MAKEUP, FESTIVAL]) expect(canReport(u(role), s, 'p1')).toBe(false);
    }
    expect(canReport(null, REGULAR)).toBe(false);
  });
});
