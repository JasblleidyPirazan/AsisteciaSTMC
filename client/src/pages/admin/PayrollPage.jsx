import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';
import { buildPeriodOptions, getCurrentPeriod, periodLabel } from '../../utils/periods';

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

const AVATAR_COLORS = ['#3F52A8', '#4F9FB2', '#7A5AF8', '#E8A23B', '#1FA971', '#E8526A', '#6F7BA6'];
function initials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·';
}
function colorFor(str) {
  let h = 0;
  for (const c of String(str || '')) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

// Tarjeta KPI (mismo lenguaje visual que el panel de Bienvenida).
function StatCard({ icon, tint, label, value, sub, subColor }) {
  return (
    <div className="card">
      <div className="kpi-ico" style={{ background: tint.bg, color: tint.fg }}>{icon}</div>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-num" style={{ fontSize: '1.5rem' }}>{value}</div>
      {sub && <div className="kpi-sub" style={{ color: subColor || 'var(--text-soft)' }}>{sub}</div>}
    </div>
  );
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
  const [semester, setSemester] = useState(null);

  const locked = !!closure?.locked;

  // Semestre activo → numeración correlativa de quincenas en las etiquetas.
  useEffect(() => {
    api.get('/semesters/active').then(setSemester).catch(() => setSemester(null));
  }, []);

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

  // Card (móvil / columna angosta) — con avatar del beneficiario.
  function PayeeCard({ s }) {
    const detail = detailMap[s.payeeId];
    const retained = (s.suspendedTotal || 0) + (s.pendingTotal || 0);
    const isOpen = expanded === s.payeeId;
    return (
      <div className="card mb-2">
        <div className="flex items-center gap-3" onClick={() => loadDetail(s.payeeId)}
          style={{ cursor: 'pointer' }}>
          <span className="avatar" style={{ background: colorFor(s.name) }}>{initials(s.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-gray">{s.classCount} clases</div>
            {retained > 0 && (
              <div className="text-xs" style={{ color: 'var(--red)' }}>Retenido: {fmt(retained)}</div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="cost-total">{fmt(s.payableTotal ?? s.total)}</div>
            <div className="text-xs text-gray">{isOpen ? '▲ ocultar' : '▼ detalle'}</div>
          </div>
        </div>
        {isOpen && detail && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
            <DetailRows detail={detail} payeeId={s.payeeId} />
          </div>
        )}
      </div>
    );
  }

  // Tabla (escritorio / pantalla ancha) — con avatar en la columna de nombre.
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
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="avatar" style={{ width: 30, height: 30, fontSize: '0.7rem', background: colorFor(s.name) }}>{initials(s.name)}</span>
                        <span className="font-medium">{s.name}</span>
                      </div>
                    </td>
                    <td className="num">{s.classCount}</td>
                    <td className="num font-medium" style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmt(s.payableTotal ?? s.total)}</td>
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
              <td className="num" style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmt(totalPayable)}</td>
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
  const retainedTotal = summaryData
    ? (summaryData.suspendedGrandTotal || 0) + (summaryData.pendingGrandTotal || 0) : 0;
  const headerPeriodLabel = periodLabel(period, semester);

  return (
    <div className="page page-wide">
      <div className="page-content" style={{ paddingTop: 8 }}>
        {/* Encabezado */}
        <div className="flex items-center justify-between mb-4" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
            <div>
              <h1 style={{ fontSize: '1.9rem' }}>Liquidación</h1>
              <p className="text-gray text-sm">Pago quincenal a profesores y asistentes · {headerPeriodLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <select className="form-input form-select" style={{ minHeight: 40, width: 'auto', fontSize: '0.85rem' }}
              value={period} onChange={(e) => setPeriod(e.target.value)}>
              {buildPeriodOptions().map((p) => (
                <option key={p} value={p}>{periodLabel(p, semester)}</option>
              ))}
            </select>
            <button className="btn btn-outline" style={{ minHeight: 40 }}
              onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exportando…' : '⬇ Excel'}
            </button>
          </div>
        </div>

        {loading ? <div className="spinner" /> : (
          <>
            {/* KPIs */}
            {summaryData && (
              <div className="home-kpis">
                <StatCard icon="✓" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
                  label="Gran total habilitado" value={fmt(summaryData.grandTotal)}
                  sub="listo para pagar" subColor="var(--success)" />
                <StatCard icon="🎓" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
                  label="Profesores" value={fmt(summaryData.totalProfessors)}
                  sub={`${professors.length} beneficiario${professors.length !== 1 ? 's' : ''}`} />
                <StatCard icon="🤝" tint={{ bg: 'rgba(79,159,178,0.14)', fg: '#4F9FB2' }}
                  label="Asistentes" value={fmt(summaryData.totalAssistants)}
                  sub={`${assistants.length} beneficiario${assistants.length !== 1 ? 's' : ''}`} />
                <StatCard icon="⏸" tint={{ bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                  label="Retenido" value={fmt(retainedTotal)}
                  sub={retainedTotal > 0 ? 'suspendido / pendiente' : 'sin retenciones'}
                  subColor={retainedTotal > 0 ? 'var(--red)' : 'var(--text-soft)'} />
              </div>
            )}

            {/* Cierre de quincena */}
            {hasItems && (
              locked ? (
                <div className="card mb-4" style={{ borderLeft: '4px solid var(--gray-400)', background: 'var(--gray-50)' }}>
                  <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <div className="flex items-center gap-3">
                      <span className="kpi-ico" style={{ background: 'rgba(120,120,120,0.14)', color: '#666', marginBottom: 0 }}>🔒</span>
                      <div>
                        <div className="font-medium">Quincena cerrada</div>
                        <div className="text-xs text-gray mt-1">
                          Por {closure.closedByName || '—'} · {fmtDateTime(closure.closedAt)}
                        </div>
                        <div className="text-xs text-gray">
                          Edición de reportes y pagos bloqueada para este período.
                        </div>
                      </div>
                    </div>
                    <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem', color: 'var(--red)' }}
                      onClick={handleReopen} disabled={approving}>
                      Reabrir
                    </button>
                  </div>
                </div>
              ) : (
                <div className="card mb-4" style={{ borderLeft: '4px solid var(--green)' }}>
                  <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div className="font-medium">Cerrar quincena</div>
                      <div className="text-xs text-gray mt-1">
                        Congela la liquidación, arrastra los pagos suspendidos a la siguiente quincena
                        y bloquea la edición. Reversible.
                      </div>
                    </div>
                    <button className="btn btn-success" style={{ minHeight: 40 }}
                      onClick={handleClose} disabled={approving}>
                      {approving ? 'Cerrando…' : '🔒 Cerrar quincena'}
                    </button>
                  </div>
                </div>
              )
            )}

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
