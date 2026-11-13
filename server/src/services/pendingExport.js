// Excel de clases pendientes por recuperar (Reposiciones y reprogramación →
// "⬇️ Excel de pendientes"). Una fila por estudiante MATRICULADO con lo que
// debe por reposición (lluvia, canceladas por la Escuela, justificadas) y por
// reprogramación (festivos y recesos), y el total de las dos.
// Todo sale del ledger: las mismas cifras de la pantalla y de la ficha PDF.
const { roundUnits } = require('./attendanceStats');

const INCLUDED_STATUS = 'MATRICULADO';

/** Filas del Excel, de mayor a menor total (luego por nombre). Pura. */
function buildPendingRows(ledgers = []) {
  return ledgers
    .filter((l) => l.status === INCLUDED_STATUS)
    .map((l) => {
      const reposicion = l.reposicion?.pendientes || 0;
      const reprogramacion = l.calendario?.recuperables || 0;
      return {
        document: l.document || '',
        name: l.name,
        groups: (l.groups || []).map((g) => g.code).filter(Boolean).join(', '),
        professor: (l.groups || [])[0]?.professor || '',
        reposicion,
        reposicionAgendadas: Math.min(reposicion, l.reposicion?.agendadas || 0),
        reprogramacion,
        reprogramacionAgendadas: Math.min(reprogramacion, l.calendario?.agendadas || 0),
        total: roundUnits(reposicion + reprogramacion),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));
}

/** Fila de totales (suma de cada columna numérica). Pura. */
function totalsRow(rows) {
  const sum = (k) => roundUnits(rows.reduce((acc, r) => acc + (r[k] || 0), 0));
  return {
    reposicion: sum('reposicion'),
    reposicionAgendadas: sum('reposicionAgendadas'),
    reprogramacion: sum('reprogramacion'),
    reprogramacionAgendadas: sum('reprogramacionAgendadas'),
    total: sum('total'),
  };
}

// Encabezados del Excel, en orden
const COLUMNS = [
  ['Documento', 'document'],
  ['Estudiante', 'name'],
  ['Grupo', 'groups'],
  ['Profesor', 'professor'],
  ['Por reposición', 'reposicion'],
  ['Reposición ya agendada', 'reposicionAgendadas'],
  ['Por reprogramación', 'reprogramacion'],
  ['Reprogramación ya agendada', 'reprogramacionAgendadas'],
  ['Total por recuperar', 'total'],
];

/** Filas como objetos { encabezado: valor } listos para XLSX.utils.json_to_sheet, con fila TOTAL. */
function toSheetData(rows) {
  const line = (r) => Object.fromEntries(COLUMNS.map(([h, k]) => [h, r[k] ?? '']));
  const data = rows.map(line);
  data.push(line({ name: `TOTAL (${rows.length} estudiantes)`, ...totalsRow(rows) }));
  return data;
}

module.exports = { buildPendingRows, totalsRow, toSheetData, COLUMNS };
