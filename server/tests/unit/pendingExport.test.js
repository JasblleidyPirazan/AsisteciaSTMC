import { describe, it, expect } from 'vitest';
import { buildPendingRows, totalsRow, toSheetData } from '../../src/services/pendingExport.js';

const L = (id, status, rep, recup, over = {}) => ({
  studentId: id, name: `Est ${id}`, document: `d${id}`, status,
  groups: [{ code: 'G1', professor: 'Profe' }, { code: 'G2', professor: 'Otro' }],
  reposicion: { pendientes: rep, agendadas: 1 },
  calendario: { recuperables: recup, agendadas: 0 },
  ...over,
});

describe('pendingExport', () => {
  it('solo MATRICULADOS, ordenados por total y con reposición + reprogramación', () => {
    const rows = buildPendingRows([
      L('a', 'MATRICULADO', 1, 1),
      L('b', 'INSCRITO', 5, 5),
      L('c', 'MATRICULADO', 3, 2.5),
      L('d', 'GRADUADO', 0, 0),
    ]);
    expect(rows.map((r) => r.document)).toEqual(['dc', 'da']);
    expect(rows[0]).toMatchObject({ groups: 'G1, G2', professor: 'Profe', reposicion: 3, reprogramacion: 2.5, total: 5.5 });
    // lo agendado no supera lo pendiente
    expect(buildPendingRows([L('e', 'MATRICULADO', 0, 2)])[0].reposicionAgendadas).toBe(0);
  });

  it('fila TOTAL con la suma de cada columna', () => {
    const rows = buildPendingRows([L('a', 'MATRICULADO', 1, 1), L('c', 'MATRICULADO', 3, 2)]);
    expect(totalsRow(rows)).toMatchObject({ reposicion: 4, reprogramacion: 3, total: 7 });
    const data = toSheetData(rows);
    expect(data).toHaveLength(3);
    expect(data[2]).toMatchObject({ Estudiante: 'TOTAL (2 estudiantes)', 'Total por recuperar': 7 });
    expect(Object.keys(data[0])).toEqual(['Documento', 'Estudiante', 'Grupo', 'Profesor', 'Por reposición',
      'Reposición ya agendada', 'Por reprogramación', 'Reprogramación ya agendada', 'Total por recuperar']);
  });
});
