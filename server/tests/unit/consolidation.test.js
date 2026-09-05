import { describe, it, expect } from 'vitest';
import { diffReports, effectiveDictatingId, normalize, ownerProfessorId, resolveReporterType }
  from '../../src/services/consolidation.js';

// Helper: build a normalized report
function rep(attendance, { dictating = 'p1', assistant = null } = {}) {
  return { dictatingProfessorId: dictating, assistantId: assistant, attendance };
}

describe('diffReports — coincidencia profesor vs coordinador', () => {
  it('coincide cuando P/A/J, quién-dictó y asistente son iguales', () => {
    const d = diffReports(
      rep({ s1: 'PRESENTE', s2: 'AUSENTE' }, { assistant: 'a1' }),
      rep({ s1: 'PRESENTE', s2: 'AUSENTE' }, { assistant: 'a1' })
    );
    expect(d.matched).toBe(true);
  });

  it('sin estudiantes pero mismo dictó/asistente → coincide', () => {
    expect(diffReports(rep({}), rep({})).matched).toBe(true);
  });

  it('difiere el estado de un estudiante → no coincide', () => {
    const d = diffReports(
      rep({ s1: 'PRESENTE', s2: 'PRESENTE' }),
      rep({ s1: 'PRESENTE', s2: 'AUSENTE' })
    );
    expect(d.matched).toBe(false);
    expect(d.students.find((s) => s.studentId === 's2').match).toBe(false);
    expect(d.students.find((s) => s.studentId === 's1').match).toBe(true);
  });

  it('un estudiante en un solo reporte → no coincide (lado faltante = null)', () => {
    const d = diffReports(rep({ s1: 'PRESENTE', s2: 'PRESENTE' }), rep({ s1: 'PRESENTE' }));
    expect(d.matched).toBe(false);
    const s2 = d.students.find((s) => s.studentId === 's2');
    expect(s2.professor).toBe('PRESENTE');
    expect(s2.coordinator).toBe(null);
  });

  it('difiere quién dictó → no coincide', () => {
    const d = diffReports(rep({ s1: 'PRESENTE' }, { dictating: 'p1' }), rep({ s1: 'PRESENTE' }, { dictating: 'p2' }));
    expect(d.matched).toBe(false);
    expect(d.dictating.match).toBe(false);
  });

  it('difiere el asistente → no coincide', () => {
    const d = diffReports(
      rep({ s1: 'PRESENTE' }, { assistant: 'a1' }),
      rep({ s1: 'PRESENTE' }, { assistant: 'a2' })
    );
    expect(d.matched).toBe(false);
    expect(d.assistant.match).toBe(false);
  });

  it('ambos sin asistente → coincide en asistente', () => {
    const d = diffReports(rep({ s1: 'PRESENTE' }), rep({ s1: 'PRESENTE' }));
    expect(d.assistant.match).toBe(true);
    expect(d.matched).toBe(true);
  });

  it('NO_APLICA coincide cuando ambos lo marcan; difiere contra PRESENTE', () => {
    expect(diffReports(rep({ s1: 'NO_APLICA' }), rep({ s1: 'NO_APLICA' })).matched).toBe(true);
    const d = diffReports(rep({ s1: 'NO_APLICA' }), rep({ s1: 'PRESENTE' }));
    expect(d.matched).toBe(false);
    expect(d.students.find((s) => s.studentId === 's1').match).toBe(false);
  });

  it('la justificación NO afecta la coincidencia (no se compara)', () => {
    // diffReports solo recibe status; la justificación nunca llega aquí
    const d = diffReports(rep({ s1: 'JUSTIFICADA' }), rep({ s1: 'JUSTIFICADA' }));
    expect(d.matched).toBe(true);
  });
});

describe('effectiveDictatingId — quién dictó efectivo', () => {
  it('titular (dictatedByOwner) → el profesor del grupo', () => {
    expect(effectiveDictatingId({ dictatedByOwner: true, dictatingProfessorId: null }, 'gp1')).toBe('gp1');
  });

  it('sustituto → el profesor sustituto del reporte', () => {
    expect(effectiveDictatingId({ dictatedByOwner: false, dictatingProfessorId: 'sub1' }, 'gp1')).toBe('sub1');
  });
});

describe('normalize — reporte de BD a forma comparable', () => {
  it('mapea attendance[] a { studentId: status } y resuelve el dictó efectivo', () => {
    const n = normalize(
      {
        dictatedByOwner: true,
        dictatingProfessorId: null,
        assistantId: 'a1',
        attendance: [
          { studentId: 's1', status: 'PRESENTE' },
          { studentId: 's2', status: 'AUSENTE' },
        ],
      },
      'gp1'
    );
    expect(n).toEqual({
      dictatingProfessorId: 'gp1',
      assistantId: 'a1',
      attendance: { s1: 'PRESENTE', s2: 'AUSENTE' },
    });
  });
});

describe('ownerProfessorId — quién es el titular de la sesión', () => {
  it('clase regular: el profesor del grupo', () => {
    expect(ownerProfessorId({ kind: 'REGULAR', group: { professorId: 'p1' } })).toBe('p1');
  });

  it('reposición grupal: no hay grupo, es el profesor asignado al crearla', () => {
    expect(ownerProfessorId({ kind: 'MAKEUP', makeupProfessorId: 'p7', group: null })).toBe('p7');
  });

  it('sin titular resuelve a null (no rompe la comparación)', () => {
    expect(ownerProfessorId({ kind: 'MAKEUP' })).toBe(null);
    expect(ownerProfessorId({ kind: 'REGULAR' })).toBe(null);
  });
});

describe('resolveReporterType — qué reporte escribe cada rol', () => {
  it('el profesor escribe el reporte del profesor', () => {
    expect(resolveReporterType('TEACHER')).toBe('PROFESSOR');
  });

  it('coordinador y administración escriben el del coordinador', () => {
    expect(resolveReporterType('PHYSICAL_TRAINER')).toBe('COORDINATOR');
    expect(resolveReporterType('ADMIN')).toBe('COORDINATOR');
  });

  it('el superadmin edita cualquiera, pero debe decir cuál', () => {
    expect(resolveReporterType('SUPERADMIN', 'PROFESSOR')).toBe('PROFESSOR');
    expect(resolveReporterType('SUPERADMIN', 'COORDINATOR')).toBe('COORDINATOR');
    expect(resolveReporterType('SUPERADMIN', undefined)).toBe(null);
    expect(resolveReporterType('SUPERADMIN', 'CUALQUIERA')).toBe(null);
  });

  it('los demás roles no escriben reporte', () => {
    expect(resolveReporterType('ASSISTANT')).toBe(null);
    expect(resolveReporterType('PARENT')).toBe(null);
    expect(resolveReporterType('RECEPTION')).toBe(null);
  });
});

describe('la reposición usa la misma comparación que una clase regular', () => {
  it('coincide cuando P/A/J y asistente son iguales', () => {
    const d = diffReports(
      rep({ s1: 'PRESENTE', s2: 'JUSTIFICADA' }, { dictating: 'p7', assistant: 'a1' }),
      rep({ s1: 'PRESENTE', s2: 'JUSTIFICADA' }, { dictating: 'p7', assistant: 'a1' })
    );
    expect(d.matched).toBe(true);
  });

  it('un sustituto declarado por uno solo rompe la coincidencia', () => {
    // El profesor titular de la reposición es p7; el coordinador dice que la
    // dictó otro. normalize() resuelve el titular con ownerProfessorId.
    const prof = normalize({ dictatedByOwner: true, assistantId: 'a1', attendance: [] }, 'p7');
    const coord = normalize({ dictatedByOwner: false, dictatingProfessorId: 'p9', assistantId: 'a1', attendance: [] }, 'p7');
    expect(diffReports(prof, coord).matched).toBe(false);
    expect(diffReports(prof, coord).dictating).toMatchObject({ professor: 'p7', coordinator: 'p9' });
  });
});
