import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { fmtDate } from '../utils/dates';

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

const PAY_STATUS_BADGE = {
  SUSPENDED_LATE: { cls: 'badge-red', label: 'Suspendido — reporte tardío' },
  PENDING_MATCH: { cls: 'badge-yellow', label: 'Pendiente de validación' },
};

function buildPeriodOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    options.push({ value: `${y}-${m}-1`, label: `${y}-${m} (1ª quincena)` });
    options.push({ value: `${y}-${m}-2`, label: `${y}-${m} (2ª quincena)` });
  }
  return options;
}

function getCurrentPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const half = now.getDate() <= 15 ? '1' : '2';
  return `${y}-${m}-${half}`;
}

export default function MyPayrollPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/payroll', { period })
      .then((items) => setData(items?.[0] || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  async function handleExport() {
    setExporting(true);
    try {
      const token = localStorage.getItem('stmc_token');
      const res = await fetch(`/api/payroll/export?period=${encodeURIComponent(period)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mi-liquidacion-${period}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  }

  const roleLabel = user?.role === 'TEACHER' ? 'Profesor' : 'Asistente';

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/')}>←</button>
        <h1>Mi quincena</h1>
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
            <div className="card mb-3">
              <div className="text-xs text-gray mb-1">{roleLabel}{data?.name ? ` · ${data.name}` : ''}</div>
              <div className="cost-row">
                <span className="font-medium">Total habilitado</span>
                <span className="cost-total">{fmt(data?.payableTotal ?? data?.total)}</span>
              </div>
              {((data?.suspendedTotal || 0) + (data?.pendingTotal || 0)) > 0 && (
                <div className="cost-row">
                  <span className="text-sm" style={{ color: 'var(--red)' }}>Retenido</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--red)' }}>
                    {fmt((data?.suspendedTotal || 0) + (data?.pendingTotal || 0))}
                  </span>
                </div>
              )}
              <div className="text-xs text-gray">{data?.records?.length || 0} clases liquidadas</div>
            </div>

            <button
              className="btn btn-outline btn-full mb-3"
              style={{ fontSize: '0.875rem' }}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Exportando...' : '⬇ Descargar Excel'}
            </button>

            {!data || data.records?.length === 0 ? (
              <div className="alert alert-info">No hay registros de pago para este período.</div>
            ) : (
              data.records.map((r) => {
                const badge = PAY_STATUS_BADGE[r.payStatus];
                return (
                  <div key={r.id} className="card mb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">
                          {fmtDate(r.session?.date, { day: 'numeric', month: 'short' })} · {r.session?.group?.code || r.session?.title}
                        </div>
                        <div className="text-xs text-gray">
                          {r.payeeType === 'PROFESSOR'
                            ? `${r.presentCount} estudiantes · ${parseFloat(r.effectiveUnits)} und.`
                            : `Tarifa fija · ${parseFloat(r.effectiveUnits)} und.`}
                        </div>
                        {badge && <span className={`badge ${badge.cls}`} style={{ marginTop: 4 }}>{badge.label}</span>}
                      </div>
                      <span className="font-medium">{fmt(r.total)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
