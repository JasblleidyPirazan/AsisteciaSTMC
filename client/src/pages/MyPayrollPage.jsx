import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { fmtDate } from '../utils/dates';
import { buildPeriodOptions, getCurrentPeriod, periodLabel } from '../utils/periods';

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

const PAY_STATUS_BADGE = {
  SUSPENDED_LATE: { cls: 'badge-red', label: 'Suspendido — reporte tardío' },
  PENDING_MATCH: { cls: 'badge-yellow', label: 'Pendiente de validación' },
};

// Tarjeta KPI (mismo lenguaje visual que el panel y Liquidación).
function StatCard({ icon, tint, label, value, sub, subColor }) {
  return (
    <div className="card">
      <div className="kpi-ico" style={{ background: tint.bg, color: tint.fg }}>{icon}</div>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-num" style={{ fontSize: '1.4rem' }}>{value}</div>
      {sub && <div className="kpi-sub" style={{ color: subColor || 'var(--text-soft)' }}>{sub}</div>}
    </div>
  );
}

// Una clase liquidada de la quincena.
function RecordCard({ r }) {
  const badge = PAY_STATUS_BADGE[r.payStatus];
  return (
    <div className="card mb-2">
      <div className="flex items-center justify-between">
        <div style={{ minWidth: 0 }}>
          <div className="text-sm font-medium">
            {fmtDate(r.session?.date, { day: 'numeric', month: 'short' })} · {r.session?.group?.code || r.session?.title}
          </div>
          <div className="text-xs text-gray">
            {r.payeeType === 'PROFESSOR'
              ? `${r.presentCount} estudiantes · ${parseFloat(r.effectiveUnits)} und.`
              : `Tarifa fija · ${parseFloat(r.effectiveUnits)} und.`}
          </div>
          <div className="flex items-center gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
            {badge && <span className={`badge ${badge.cls}`}>{badge.label}</span>}
            {r.carriedFromPeriod && <span className="badge badge-gray">arrastrada de {r.carriedFromPeriod}</span>}
            {!badge && r.paidAt && <span className="badge badge-green">✓ Pagado</span>}
          </div>
        </div>
        <span className="font-medium" style={{ flexShrink: 0 }}>{fmt(r.total)}</span>
      </div>
    </div>
  );
}

export default function MyPayrollPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [data, setData] = useState(null);
  const [semester, setSemester] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/payroll', { period })
      .then((items) => setData(items?.[0] || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  // El acumulado del semestre no depende de la quincena seleccionada.
  useEffect(() => {
    api.get('/payroll/my-semester').then(setSemester).catch(() => setSemester(null));
  }, []);

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

  // Reparte las clases de la quincena en pendientes por pago vs. ya pagadas.
  const records = data?.records || [];
  const paid = records.filter((r) => !PAY_STATUS_BADGE[r.payStatus] && r.paidAt);
  const pending = records.filter((r) => !PAY_STATUS_BADGE[r.payStatus] && !r.paidAt);
  const retained = records.filter((r) => PAY_STATUS_BADGE[r.payStatus]);
  const paidTotal = paid.reduce((s, r) => s + parseFloat(r.total), 0);
  const pendingTotal = pending.reduce((s, r) => s + parseFloat(r.total), 0);

  return (
    <div className="page page-wide">
      <div className="page-content" style={{ paddingTop: 8 }}>
        {/* Encabezado */}
        <div className="flex items-center justify-between mb-4" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <button className="nav-back" onClick={() => navigate('/')}>←</button>
            <div>
              <h1 style={{ fontSize: '1.9rem' }}>Mi quincena</h1>
              <p className="text-gray text-sm">{roleLabel}{data?.name ? ` · ${data.name}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <select className="form-input form-select" style={{ minHeight: 40, width: 'auto', fontSize: '0.85rem' }}
              value={period} onChange={(e) => setPeriod(e.target.value)}>
              {buildPeriodOptions(semester, period).map((p) => (
                <option key={p} value={p}>{periodLabel(p, semester)}</option>
              ))}
            </select>
            <button className="btn btn-outline" style={{ minHeight: 40 }}
              onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exportando…' : '⬇ Excel'}
            </button>
          </div>
        </div>

        {/* Acumulado del semestre (independiente de la quincena) */}
        {semester && (
          <div className="home-kpis">
            <StatCard icon="🎓" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
              label={`Acumulado del semestre${semester.semesterName ? ` · ${semester.semesterName}` : ''}`}
              value={fmt(semester.paidTotal + semester.pendingPayableTotal)}
              sub={`${semester.classCount} clases`} />
            <StatCard icon="✓" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
              label="Pagado (semestre)" value={fmt(semester.paidTotal)}
              sub="ya recibido" subColor="var(--success)" />
            <StatCard icon="⏳" tint={{ bg: 'rgba(232,162,59,0.16)', fg: '#E8A23B' }}
              label="Pendiente (semestre)" value={fmt(semester.pendingPayableTotal)}
              sub="habilitado, sin pagar" subColor="var(--text-soft)" />
            {semester.retainedTotal > 0 && (
              <StatCard icon="⏸" tint={{ bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                label="Retenido (semestre)" value={fmt(semester.retainedTotal)}
                sub="suspendido / pendiente" subColor="var(--red)" />
            )}
          </div>
        )}

        {loading ? <div className="spinner" /> : (
          <>
            {/* Resumen de la quincena seleccionada */}
            <div className="card mb-3">
              <div className="text-xs text-gray mb-2" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {periodLabel(period, semester)}
              </div>
              <div className="cost-row">
                <span className="text-sm" style={{ color: 'var(--green)' }}>✓ Pagado</span>
                <span className="font-medium" style={{ color: 'var(--green)' }}>{fmt(paidTotal)}</span>
              </div>
              <div className="cost-row">
                <span className="text-sm" style={{ color: 'var(--yellow)' }}>⏳ Pendiente por pago</span>
                <span className="font-medium" style={{ color: 'var(--yellow)' }}>{fmt(pendingTotal)}</span>
              </div>
              {((data?.suspendedTotal || 0) + (data?.pendingTotal || 0)) > 0 && (
                <div className="cost-row">
                  <span className="text-sm" style={{ color: 'var(--red)' }}>⏸ Retenido</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--red)' }}>
                    {fmt((data?.suspendedTotal || 0) + (data?.pendingTotal || 0))}
                  </span>
                </div>
              )}
              <div className="cost-row" style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 8, marginTop: 4 }}>
                <span className="font-medium">Total habilitado</span>
                <span className="cost-total">{fmt(data?.payableTotal ?? data?.total)}</span>
              </div>
              <div className="text-xs text-gray">{records.length} clases liquidadas</div>
            </div>

            {records.length === 0 ? (
              <div className="alert alert-info">No hay registros de pago para esta quincena.</div>
            ) : (
              <>
                {pending.length > 0 && (
                  <>
                    <h3 className="mb-2" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ⏳ Pendientes por pago · {pending.length}
                    </h3>
                    {pending.map((r) => <RecordCard key={r.id} r={r} />)}
                  </>
                )}
                {paid.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-3" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ✓ Ya pagadas · {paid.length}
                    </h3>
                    {paid.map((r) => <RecordCard key={r.id} r={r} />)}
                  </>
                )}
                {retained.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-3" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ⏸ Retenidas · {retained.length}
                    </h3>
                    {retained.map((r) => <RecordCard key={r.id} r={r} />)}
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
