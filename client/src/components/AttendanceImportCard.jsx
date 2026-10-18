import { useState } from 'react';
import { api } from '../api/client';
import { fmtDate } from '../utils/dates';
import { toast } from '../utils/toast';

// Importar asistencia desde Excel (solo Superadmin). Cada clase entra como si
// profesor y coordinador la hubieran reportado igual: queda consolidada, con
// pago habilitado, sin que nadie tenga que reportarla. Primero vista previa.
const ACTION_BADGE = {
  importar: ['badge-blue', 'Se importa'],
  importada: ['badge-green', 'Importada'],
  omitir: ['badge-gray', 'Se omite'],
  error: ['badge-red', 'Error'],
};

export default function AttendanceImportCard() {
  const [fileName, setFileName] = useState('');
  const [b64, setB64] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null); setError('');
    const reader = new FileReader();
    reader.onload = () => setB64(String(reader.result).split(',')[1] || '');
    reader.onerror = () => setError('No se pudo leer el archivo');
    reader.readAsDataURL(file);
  }

  async function run(dryRun) {
    if (!b64) { setError('Selecciona un archivo .xlsx'); return; }
    if (!dryRun && !confirm(`Se cargarán ${result?.totals?.toImport || 0} clases como reportadas y consolidadas, con su pago. ¿Continuar?`)) return;
    setBusy(true); setError('');
    try {
      const data = await api.post('/system/import-attendance', { fileBase64: b64, dryRun });
      setResult(data);
      if (!dryRun) toast.success(`Listo: ${data.totals.imported} clases importadas.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const t = result?.totals;
  return (
    <div className="card mb-3">
      <div className="text-sm font-medium">Importar asistencia (Excel)</div>
      <div className="text-xs text-gray mb-3" style={{ marginTop: 4 }}>
        Carga reportes de asistencia tomados por fuera del sistema. Cada clase queda como si el
        profesor y el coordinador la hubieran reportado igual (consolidada), con el pago del profesor
        y del asistente <strong>habilitado</strong> (no se suspende por reporte tardío) y listo para
        aprobar en Liquidación. Columnas: <strong>Fecha, Grupo, Estudiante, Marca</strong> (P/A/J/NA) y
        opcionales <strong>Detalle</strong> («repone de …» = reposición), <strong>Profesor</strong> (vacío = titular)
        y <strong>Asistente</strong> (vacío = sin asistente). Grupo <strong>REP</strong> = reposición grupal.
        Las clases ya reportadas o canceladas se omiten.
      </div>
      <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="file" accept=".xlsx,.xls" onChange={onFile} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn btn-outline" disabled={busy || !b64} onClick={() => run(true)}>
          {busy && result?.dryRun !== false ? 'Revisando…' : 'Vista previa'}
        </button>
        <button className="btn btn-primary" disabled={busy || !result?.dryRun || !t?.toImport} onClick={() => run(false)}>
          {busy ? 'Importando…' : `Importar ${t?.toImport || ''} clases`}
        </button>
      </div>
      {fileName && <div className="text-xs text-gray mt-1">{fileName}</div>}
      {error && <div className="alert alert-error mt-2">{error}</div>}

      {result && (
        <div className="mt-3">
          <div className="text-sm mb-2">
            {result.dryRun ? 'Vista previa' : 'Resultado'}: {t.classes} clases ·{' '}
            {result.dryRun
              ? <><strong>{t.toImport}</strong> se importan ({t.records} marcas)</>
              : <><strong>{t.imported}</strong> importadas</>}
            {' '}· {t.skipped} se omiten · <span style={{ color: t.errors ? 'var(--red)' : undefined }}>{t.errors} con error</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Fecha</th><th>Grupo</th><th>Profesor</th><th>Asistente</th><th>P</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {result.classes.map((c) => {
                  const [cls, label] = ACTION_BADGE[c.action] || ['badge-gray', c.action];
                  return (
                    <tr key={`${c.date}-${c.group}`}>
                      <td>{c.date ? fmtDate(c.date) : '—'}</td>
                      <td>{c.group}{c.kind === 'MAKEUP' ? ' (reposición)' : ''}</td>
                      <td>{c.professor || '—'}{c.substitute ? ' (sustituto)' : ''}</td>
                      <td>{c.assistant || '—'}</td>
                      <td>{c.present}/{c.records}</td>
                      <td>
                        <span className={`badge ${cls}`}>{label}</span>
                        {c.note && <div className="text-xs text-gray">{c.note}</div>}
                        {c.errors.map((e) => <div key={e} className="text-xs" style={{ color: 'var(--red)' }}>{e}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
