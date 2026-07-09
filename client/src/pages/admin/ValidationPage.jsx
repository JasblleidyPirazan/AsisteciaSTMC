import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';

function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * Cola de validación del coordinador: sesiones realizadas con asistente.
 * Una clase queda "en verde" (pago del asistente habilitado) solo cuando
 * coinciden el reporte del profesor, la confirmación del asistente y la
 * validación del coordinador.
 */
export default function ValidationPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayStr());
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [date]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/sessions/validation-queue', { date });
      setSessions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleValidation(s) {
    setSaving((m) => ({ ...m, [s.id]: true }));
    try {
      await api.post(`/sessions/${s.id}/validate-assistant`, { confirm: !s.coordinatorValidatedAt });
      await load();
    } catch (err) {
      alert(err.message);
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
          El pago del asistente se habilita únicamente cuando coinciden el reporte del
          profesor, la confirmación del asistente y tu validación.
        </p>

        <div className="form-group mb-3">
          <label className="form-label">Fecha</label>
          <input type="date" className="form-input" value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>

        {error && <div className="alert alert-error mb-3">{error}</div>}
        {loading ? <div className="spinner" /> : sessions.length === 0 ? (
          <div className="alert alert-info">No hay clases con asistente para esta fecha.</div>
        ) : (
          sessions.map((s) => {
            const stateColor = s.complete ? 'var(--green)' : s.matches ? 'var(--yellow)' : 'var(--red)';
            return (
              <div key={s.id} className="card mb-3" style={{ borderLeft: `4px solid ${stateColor}` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{s.groupCode}</span>
                  {s.complete ? (
                    <span className="badge badge-green">✓ Validada</span>
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
