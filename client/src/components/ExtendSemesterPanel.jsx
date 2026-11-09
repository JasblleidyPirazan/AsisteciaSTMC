import { useState } from 'react';
import { api } from '../api/client';
import { fmtDate } from '../utils/dates';

function addDays(ymd, n) {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Ampliar el semestre: elegir la nueva fecha de fin → vista previa del impacto
// (calculada con el mismo ledger del sistema) → confirmar.
export default function ExtendSemesterPanel({ semester, onExtended, onClose }) {
  const min = addDays(semester.endDate, 1);
  const [endDate, setEndDate] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(dryRun) {
    setBusy(true);
    setError('');
    try {
      const data = await api.post(`/semesters/${semester.id}/extend`, { endDate, dryRun });
      if (dryRun) setPreview(data);
      else onExtended(data.semester);
    } catch (err) {
      setError(err.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const imp = preview?.impact;
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
      <div className="font-medium mb-1">📅 Ampliar semestre</div>
      <p className="text-xs text-gray mb-2">
        Corre la fecha de fin (hoy {fmtDate(semester.endDate)}). El sistema recalcula solo cuántas clases le quedan a cada
        estudiante antes del cierre, quiénes no alcanzan, las suspensiones y la fecha que dice el correo semanal. Las clases
        ya registradas no cambian.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
        <div>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>Nueva fecha de fin</label>
          <input type="date" className="form-input" min={min} value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPreview(null); }} />
        </div>
        <button className="btn btn-outline" disabled={!endDate || busy} onClick={() => run(true)}>
          {busy && !preview ? 'Calculando…' : 'Ver impacto'}
        </button>
      </div>
      {error && <div className="alert alert-error mt-2">{error}</div>}

      {preview && (
        <div className="card mt-2" style={{ background: 'var(--gray-50, #f9fafb)' }}>
          <div className="text-sm mb-1">
            Del <b>{fmtDate(preview.from)}</b> al <b>{fmtDate(preview.to)}</b> (+{preview.days} día{preview.days === 1 ? '' : 's'}).
          </div>
          {imp ? (
            <div className="text-sm mb-1">
              Estudiantes que no alcanzan a ver su paquete antes del cierre:{' '}
              <b>{imp.before.studentsWithDeficit} → {imp.after.studentsWithDeficit}</b>
              {' '}· clases en déficit: <b>{imp.before.deficit} → {imp.after.deficit}</b>
            </div>
          ) : (
            <div className="text-xs text-gray mb-1">Este semestre no está activo: no se calcula el impacto en los estudiantes.</div>
          )}
          <div className="text-xs text-gray mb-2">
            {preview.exclusionsInRange.length > 0
              ? <>Festivos o recesos ya cargados en el período nuevo: {preview.exclusionsInRange.map((e) => `${fmtDate(e.date)}${e.reason ? ` (${e.reason})` : ''}`).join(', ')}.</>
              : <>No hay festivos ni recesos cargados en el período nuevo.</>}
            {' '}Si cae alguno, agrégalo en “Fechas excluidas” para que no se cuente como día de clase.
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => run(false)} disabled={busy}>
              {busy ? 'Guardando…' : `Ampliar hasta ${fmtDate(preview.to)}`}
            </button>
          </div>
        </div>
      )}
      {!preview && (
        <button className="btn btn-ghost mt-2" style={{ fontSize: '0.8rem' }} onClick={onClose}>Cancelar</button>
      )}
    </div>
  );
}
