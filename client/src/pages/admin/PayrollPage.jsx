import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

function buildPeriodOptions() {
  const options = [];
  const now = new Date();
  // From next month back through the previous 6 months
  for (let i = -1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    options.push({ value: `${y}-${m}-1`, label: `${y}-${m} (1ª quincena)` });
    options.push({ value: `${y}-${m}-2`, label: `${y}-${m} (2ª quincena)` });
  }
  const seen = new Set();
  return options.filter((o) => { if (seen.has(o.value)) return false; seen.add(o.value); return true; });
}

function getCurrentPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const half = now.getDate() <= 15 ? '1' : '2';
  return `${y}-${m}-${half}`;
}

export default function PayrollPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [detailMap, setDetailMap] = useState({});
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/payroll/summary', { period });
      setSummaryData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(payeeId) {
    if (expanded === payeeId) { setExpanded(null); return; }
    setExpanded(payeeId);
    if (!detailMap[payeeId]) {
      const data = await api.get('/payroll', { period, payeeId });
      const entry = Array.isArray(data) ? data.find((d) => d.payeeId === payeeId) : null;
      setDetailMap((prev) => ({ ...prev, [payeeId]: entry }));
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const token = localStorage.getItem('stmc_token');
      const base = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${base}/payroll/export?period=${encodeURIComponent(period)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `liquidacion-${period}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    load();
    setExpanded(null);
    setDetailMap({});
  }, [period]);

  const professors = summaryData?.items?.filter((s) => s.payeeType === 'PROFESSOR') || [];
  const assistants = summaryData?.items?.filter((s) => s.payeeType === 'ASSISTANT') || [];

  function PayeeCard({ s }) {
    const detail = detailMap[s.payeeId];
    return (
      <div className="card mb-2">
        <div className="flex items-center justify-between" onClick={() => loadDetail(s.payeeId)}
          style={{ cursor: 'pointer' }}>
          <div>
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-gray">{s.classCount} clases</div>
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
                  {fmtDate(r.session.date, { day: 'numeric', month: 'short' })}
                  {' · '}{r.session.group?.code}
                  {r.presentCount > 0 && <span className="text-gray"> · {r.presentCount} est.</span>}
                </span>
                <span>{fmt(r.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

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
            {buildPeriodOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {loading ? <div className="spinner" /> : (
          <>
            {summaryData && (
              <div className="card mb-3">
                <div className="cost-row mb-1">
                  <span className="text-sm text-gray">Profesores</span>
                  <span className="font-medium">{fmt(summaryData.totalProfessors)}</span>
                </div>
                <div className="cost-row mb-2">
                  <span className="text-sm text-gray">Asistentes</span>
                  <span className="font-medium">{fmt(summaryData.totalAssistants)}</span>
                </div>
                <div className="cost-row" style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 8 }}>
                  <span className="font-medium">Gran total</span>
                  <span className="cost-total">{fmt(summaryData.grandTotal)}</span>
                </div>
              </div>
            )}

            <button
              className="btn btn-outline btn-full mb-3"
              style={{ fontSize: '0.875rem' }}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Exportando...' : '⬇ Exportar Excel'}
            </button>

            {(!summaryData || summaryData.items?.length === 0) ? (
              <div className="alert alert-info">No hay registros de pago para este período.</div>
            ) : (
              <>
                {professors.length > 0 && (
                  <>
                    <h3 className="mb-2" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Profesores
                    </h3>
                    {professors.map((s) => <PayeeCard key={s.payeeId} s={s} />)}
                  </>
                )}

                {assistants.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-3" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Asistentes
                    </h3>
                    {assistants.map((s) => <PayeeCard key={s.payeeId} s={s} />)}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
