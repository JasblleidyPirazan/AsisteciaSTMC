// Utilidades de exportación para liquidaciones y reportes (HU-LIQ-01, HU-ADM-02).

// Genera y descarga un CSV (se abre en Excel) a partir de filas y encabezados.
export function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))];
  // BOM para que Excel reconozca UTF-8 (acentos).
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Imprime la vista actual (el usuario puede "Guardar como PDF" desde el diálogo).
export function printView() {
  window.print();
}
