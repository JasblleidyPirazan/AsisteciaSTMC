import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';
import { buildPeriodOptions, getCurrentPeriod, periodLabel, periodRange } from '../../utils/periods';
import { toast } from '../../utils/toast';

/**
 * Cola de validación del coordinador: sesiones realizadas con asistente, por
 * QUINCENA (no por día). Una clase queda "en verde" (pago del asistente
 * habilitado) solo cuando coinciden el reporte del profesor, la confirmación
 * del asistente y la validación del coordinador. El filtro "Solo pendientes"
 * deja a la vista lo que falta por resolver de la quincena.
 */
export default function ValidationPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [semester, setSemester] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [error, setError] = useState('');
  const [onlyPending, setOnlyPending] = useState(true);

  // Semestre activo → numeración correlativa de quincenas en las etiquetas.
  useEffect(() => {
    api.get('/semesters/active').then(setSemester).catch(() => setSemester(null));
  }, []);

  useEffect(() => { load(); }, [period]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { from, to } = periodRange(period);
      const data = await api.get('/sessions/validation-queue', { from, to });
      setSessions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Una clase está "resuelta" cuando ya no requiere acción: el pago quedó
  // habilitado (complete). Lo demás sigue pendiente por resolver.
  const pendingCount = useMemo(() => sessions.filter((s) => !s.complete).length, [sessions]);
  const visible = useMemo(
    () => (onlyPending ? sessions.filter((s) => !s.complete) : sessions),
    [sessions, onlyPending]
  );

  async function toggleValidation(s) {
    setSaving((m) => ({ ...m, [s.id]: true }));
    try {
      await api.post(`/sessions/${s.id}/validate-assistant`, { confirm: !s.coordinatorValidatedAt });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving((m) => ({ ...m, [s.id]: false }));
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Validación</h1>
      </div>

      <div className="page-content">
        <p className="text-sm text-gray mb-3">
          El pago del asistente se habilita únicamente cuando coincide la información
          del asistente, el profesor y el coordinador. La validación es por quincena:
          lo pendiente queda a la vista hasta resolverlo.
        </p>

        {/* Selector de quincena + filtro de pendientes */}
        <div className="flex items-center justify-between mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Quincena</label>
            <select className="form-input form-select" style={{ minHeight: 40, width: 'auto' }}
              value={period} onChange={(e) => setPeriod(e.target.value)}>
              {buildPeriodOptions(semester, period).map((p) => (
                <option key={p} value={p}>{periodLabel(p, semester)}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
            <span className="text-sm">Solo pendientes</span>
          </label>
        </div>

        {/* Resumen de pendientes de la quincena */}
        {!loading && (
          <div className={`alert ${pendingCount > 0 ? 'alert-info' : 'alert-success'} mb-3`}
            style={{ borderLeft: `4px solid ${pendingCount > 0 ? 'var(--yellow)' : 'var(--green)'}` }}>
            {pendingCount > 0
              ? `⏳ ${pendingCount} clase${pendingCount !== 1 ? 's' : ''} pendiente${pendingCount !== 1 ? 's' : ''} por resolver en esta quincena.`
              : '✅ No queda nada pendiente en esta quincena.'}
          </div>
        )}

        {error && <div className="alert alert-error mb-3">{error}</div>}
        {loading ? <div className="spinner" /> : visible.length === 0 ? (
          <div className="alert alert-info">
            {onlyPending && sessions.length > 0
              ? 'No hay pendientes en esta quincena. Desmarca "Solo pendientes" para ver las ya resueltas.'
              : 'No hay clases con asistente en esta quincena.'}
          </div>
        ) : (
          visible.map((s) => {
            const stateColor = s.complete ? 'var(--green)' : s.matches ? 'var(--yellow)' : 'var(--red)';
            return (
              <div key={s.id} className="card mb-3" style={{ borderLeft: `4px solid ${stateColor}` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{s.groupCode}</span>
                  {s.complete ? (
                    <span className="badge badge-green">{s.autoValidated ? '✓ Validada automáticamente' : '✓ Validada'}</span>
                  ) : s.matches ? (
                    <span className="badge badge-yellow">Coincide — falta validar</span>
                  ) : (
                    <span className="badge badge-red">No coincide</span>
                  )}
                </div>
                <div className="text-xs text-gray mb-2">{fmtDate(s.date)} · Profesor: {s.professor?.name || '—'}</div>

                <div className="text-sm">
                  <div className="cost-row" style={{ padding: '2px 0' }}>
                    <span className="text-gray">Profesor reportó:</span>
                    <span>{s.assistantReported?.name || '— sin asistente —'}</span>
                  </div>
                  <div className="cost-row" style={{ padding: '2px 0' }}>
                    <span className="text-gray">Asistente confirmó:</span>
                    <span>{s.assistantConfirmed?.name || '— sin confirmar —'}</span>
                  </div>
                </div>

                {s.dictatedByOwner === false && (
                  <div className="alert alert-info mt-2 mb-0" style={{ marginBottom: 0, padding: '8px 12px' }}>
                    <span className="text-xs">
                      ⚠️ No dictada por el titular{s.notDictatedNote ? ` — ${s.notDictatedNote}` : ''}
                    </span>
                  </div>
                )}

                {s.autoValidated ? (
                  <div className="text-xs text-gray mt-3">
                    La información del asistente, el profesor y el coordinador coincide:
                    se validó automáticamente, sin acción manual.
                  </div>
                ) : (
                  <button
                    className={`btn btn-full mt-3 ${s.coordinatorValidatedAt ? 'btn-outline' : 'btn-primary'}`}
                    style={{ minHeight: 40, fontSize: '0.875rem' }}
                    disabled={saving[s.id] || (!s.matches && !s.coordinatorValidatedAt)}
                    onClick={() => toggleValidation(s)}
                  >
                    {saving[s.id] ? 'Guardando...'
                      : s.coordinatorValidatedAt ? 'Quitar validación'
                      : s.matches ? '✓ Validar'
                      : 'Los reportes no coinciden'}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
