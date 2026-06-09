import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

function getCurrentPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function PayrollPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(getCurrentPeriod() + '-1');
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/payroll/summary', { period });
      setSummary(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(payeeId) {
    if (expanded === payeeId) { setExpanded(null); return; }
    setExpanded(payeeId);
    const data = await api.get('/payroll', { period, payeeId });
    setDetail(data.find((d) => d.payeeId === payeeId));
  }

  useEffect(() => { load(); }, [period]);

  const total = summary.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Liquidación</h1>
      </div>

      <div className="page-content">
        <div className="form-group mb-3">
          <label className="form-label">Período (quincena)</label>
          <select className="form-input form-select" value={period}
            onChange={(e) => setPeriod(e.target.value)}>
            {[-1, 0, 1, 2].map((offset) => {
              const d = new Date();
              d.setMonth(d.getMonth() - Math.floor(offset / 2));
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              return [
                <option key={`${y}-${m}-1`} value={`${y}-${m}-1`}>{y}-{m} (1ª quincena)</option>,
                <option key={`${y}-${m}-2`} value={`${y}-${m}-2`}>{y}-{m} (2ª quincena)</option>,
              ];
            }).flat().filter((v, i, a) => a.findIndex((x) => x.key === v.key) === i).slice(0, 6)}
          </select>
        </div>

        {loading ? <div className="spinner" /> : (
          <>
            <div className="card mb-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Total período</span>
                <span className="cost-total">{fmt(total)}</span>
              </div>
            </div>

            {summary.length === 0 ? (
              <div className="alert alert-info">No hay registros de pago para este período.</div>
            ) : (
              summary.map((s) => (
                <div key={s.payeeId} className="card mb-2">
                  <div className="flex items-center justify-between" onClick={() => loadDetail(s.payeeId)}
                    style={{ cursor: 'pointer' }}>
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-gray">
                        {s.payeeType === 'PROFESSOR' ? 'Profesor' : 'Asistente'} · {s.classCount} clases
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="cost-total">{fmt(s.total)}</div>
                      <div className="text-xs text-gray">{expanded === s.payeeId ? '▲' : '▼'}</div>
                    </div>
                  </div>

                  {expanded === s.payeeId && detail && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
                      {detail.records?.map((r) => (
                        <div key={r.id} className="cost-row text-sm">
                          <span>
                            {new Date(r.session.date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                            {' · '}{r.session.group?.code}
                          </span>
                          <span>{fmt(r.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
