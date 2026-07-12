import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const PAY_STATUS_BADGE = {
  SUSPENDED_LATE: { cls: 'badge-red', label: 'Suspendido' },
  PENDING_MATCH: { cls: 'badge-yellow', label: 'Pendiente' },
};

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
  const [approving, setApproving] = useState(false);
  const [closure, setClosure] = useState(null);

  const locked = !!closure?.locked;

  async function load() {
    setLoading(true);
    try {
      const [data, closureData] = await Promise.all([
        api.get('/payroll/summary', { period }),
        api.get('/payroll/closure', { period }).catch(() => null),
      ]);
      setSummaryData(data);
      setClosure(closureData);
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

  async function refreshDetail(payeeId) {
    const data = await api.get('/payroll', { period, payeeId });
    const entry = Array.isArray(data) ? data.find((d) => d.payeeId === payeeId) : null;
    setDetailMap((prev) => ({ ...prev, [payeeId]: entry }));
  }

  async function handleMarkPaid(record, payeeId) {
    try {
      await api.patch(`/payroll/records/${record.id}/paid`, { paid: !record.paidAt });
      await refreshDetail(payeeId);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleClose() {
    if (!confirm(`¿Cerrar la quincena ${period}?\n\nSe congela la liquidación: no se podrán editar reportes ni pagos, los pagos suspendidos pasan a la siguiente quincena, y queda registrado. Podrás reabrirla si hace falta.`)) return;
    setApproving(true);
    try {
      const r = await api.post('/payroll/close', { period });
      await load();
      if (r?.carried > 0) alert(`Quincena cerrada. ${r.carried} clase(s) suspendida(s) se arrastraron a ${r.nextPeriod}.`);
    } catch (err) {
      alert(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleReopen() {
    if (!confirm('¿Reabrir esta quincena? Podrás volver a editar reportes y pagos.')) return;
    setApproving(true);
    try {
      await api.post('/payroll/reopen', { period });
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setApproving(false);
    }
  }

  useEffect(() => {
    load();
    setExpanded(null);
    setDetailMap({});
  }, [period]);

  const professors = summaryData?.items?.filter((s) => s.payeeType === 'PROFESSOR') || [];
  const assistants = summaryData?.items?.filter((s) => s.payeeType === 'ASSISTANT') || [];

  async function handleUnlock(sessionId, payeeId) {
    if (!confirm('¿Desbloquear el pago de esta clase reportada tarde?')) return;
    try {
      await api.post(`/sessions/${sessionId}/unlock-payment`, {});
      // Refresh both the detail and the summary totals
      const data = await api.get('/payroll', { period, payeeId });
      const entry = Array.isArray(data) ? data.find((d) => d.payeeId === payeeId) : null;
      setDetailMap((prev) => ({ ...prev, [payeeId]: entry }));
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  function DetailRows({ detail, payeeId }) {
    return (
      <>
        {detail.records?.map((r) => {
          const badge = PAY_STATUS_BADGE[r.payStatus];
          const payable = !badge; // PAYABLE = sin badge de retención
          return (
            <div key={r.id} style={{ padding: '4px 0' }}>
              <div className="cost-row text-sm">
                <span>
                  {fmtDate(r.session.date, { day: 'numeric', month: 'short' })}
                  {' · '}{r.session.group?.code || r.session.title}
                  {r.presentCount > 0 && <span className="text-gray"> · {r.presentCount} est.</span>}
                  {badge && <span className={`badge ${badge.cls}`} style={{ marginLeft: 6 }}>{badge.label}</span>}
                  {r.carriedFromPeriod && <span className="badge badge-gray" style={{ marginLeft: 6 }}>arrastrada de {r.carriedFromPeriod}</span>}
                  {payable && r.paidAt && <span className="badge badge-green" style={{ marginLeft: 6 }}>✓ Pagado</span>}
                </span>
                <span>{fmt(r.total)}</span>
              </div>
              {/* Pago realizado (solo habilitados) */}
              {payable && !locked && (
                <button className="btn btn-ghost" style={{ minHeight: 26, padding: '0 8px', fontSize: '0.72rem', color: r.paidAt ? 'var(--red)' : 'var(--green)' }}
                  onClick={() => handleMarkPaid(r, payeeId)}>
                  {r.paidAt ? 'Deshacer pago' : '💵 Marcar pago realizado'}
                </button>
              )}
              {r.payStatus === 'SUSPENDED_LATE' && !locked && (
                <button className="btn btn-ghost" style={{ minHeight: 26, padding: '0 8px', fontSize: '0.72rem' }}
                  onClick={() => handleUnlock(r.sessionId, payeeId)}>
                  🔓 Desbloquear pago
                </button>
              )}
            </div>
          );
        })}
      </>
    );
  }

  // Card (móvil / columna angosta)
  function PayeeCard({ s }) {
    const detail = detailMap[s.payeeId];
    const retained = (s.suspendedTotal || 0) + (s.pendingTotal || 0);
    return (
      <div className="card mb-2">
        <div className="flex items-center justify-between" onClick={() => loadDetail(s.payeeId)}
          style={{ cursor: 'pointer' }}>
          <div>
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-gray">{s.classCount} clases</div>
            {retained > 0 && (
              <div className="text-xs" style={{ color: 'var(--red)' }}>Retenido: {fmt(retained)}</div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="cost-total">{fmt(s.payableTotal ?? s.total)}</div>
            <div className="text-xs text-gray">{expanded === s.payeeId ? '▲' : '▼'}</div>
          </div>
        </div>
        {expanded === s.payeeId && detail && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
            <DetailRows detail={detail} payeeId={s.payeeId} />
          </div>
        )}
      </div>
    );
  }

  // Tabla (escritorio / pantalla ancha)
  function PayeeTable({ items, label }) {
    if (items.length === 0) return null;
    const totalPayable = items.reduce((sum, s) => sum + (s.payableTotal ?? s.total), 0);
    const totalRetained = items.reduce((sum, s) => sum + (s.suspendedTotal || 0) + (s.pendingTotal || 0), 0);
    return (
      <div className="table-wrap mb-4">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th>{label}</th>
              <th className="num">Clases</th>
              <th className="num">Habilitado</th>
              <th className="num">Retenido</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const detail = detailMap[s.payeeId];
              const retained = (s.suspendedTotal || 0) + (s.pendingTotal || 0);
              const isOpen = expanded === s.payeeId;
              return (
                <Fragment key={s.payeeId}>
                  <tr className="clickable" onClick={() => loadDetail(s.payeeId)}>
                    <td>{isOpen ? '▲' : '▼'}</td>
                    <td className="font-medium">{s.name}</td>
                    <td className="num">{s.classCount}</td>
                    <td className="num font-medium" style={{ color: 'var(--blue)' }}>{fmt(s.payableTotal ?? s.total)}</td>
                    <td className="num" style={{ color: retained > 0 ? 'var(--red)' : 'var(--gray-400)' }}>
                      {retained > 0 ? fmt(retained) : '—'}
                    </td>
                  </tr>
                  {isOpen && detail && (
                    <tr>
                      <td></td>
                      <td colSpan={4} style={{ background: 'var(--gray-50)' }}>
                        <DetailRows detail={detail} payeeId={s.payeeId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td>Total {label.toLowerCase()}</td>
              <td></td>
              <td className="num" style={{ color: 'var(--blue)' }}>{fmt(totalPayable)}</td>
              <td className="num" style={{ color: totalRetained > 0 ? 'var(--red)' : 'inherit' }}>
                {totalRetained > 0 ? fmt(totalRetained) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  const hasItems = summaryData && summaryData.items?.length > 0;

  return (
    <div className="page page-wide">
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
                  <span className="font-medium">Gran total (habilitado)</span>
                  <span className="cost-total">{fmt(summaryData.grandTotal)}</span>
                </div>
                {(summaryData.suspendedGrandTotal > 0 || summaryData.pendingGrandTotal > 0) && (
                  <div className="cost-row mt-1">
                    <span className="text-sm" style={{ color: 'var(--red)' }}>
                      Retenido (suspendido/pendiente)
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--red)' }}>
                      {fmt((summaryData.suspendedGrandTotal || 0) + (summaryData.pendingGrandTotal || 0))}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Cierre de quincena */}
            {hasItems && (
              locked ? (
                <div className="card mb-3" style={{ borderColor: 'var(--gray-400)', background: 'var(--gray-50)' }}>
                  <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div className="font-medium">🔒 Quincena cerrada</div>
                      <div className="text-xs text-gray mt-1">
                        Por {closure.closedByName || '—'} · {fmtDateTime(closure.closedAt)}
                      </div>
                      <div className="text-xs text-gray">
                        Edición de reportes y pagos bloqueada para este período.
                      </div>
                    </div>
                    <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem', color: 'var(--red)' }}
                      onClick={handleReopen} disabled={approving}>
                      Reabrir
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-success btn-full mb-3"
                  onClick={handleClose}
                  disabled={approving}
                >
                  {approving ? 'Cerrando...' : '🔒 Cerrar quincena'}
                </button>
              )
            )}

            <button
              className="btn btn-outline btn-full mb-4"
              style={{ fontSize: '0.875rem' }}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Exportando...' : '⬇ Exportar Excel'}
            </button>

            {!hasItems ? (
              <div className="alert alert-info">No hay registros de pago para este período.</div>
            ) : (
              <>
                {/* Escritorio: tablas anchas */}
                <div className="only-desktop">
                  <PayeeTable items={professors} label="Profesores" />
                  <PayeeTable items={assistants} label="Asistentes" />
                </div>

                {/* Móvil: cards */}
                <div className="only-mobile">
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
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
