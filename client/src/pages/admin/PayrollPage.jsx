import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';
import { buildPeriodOptions, getCurrentPeriod, periodLabel } from '../../utils/periods';
import { toast } from '../../utils/toast';

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

// Traducción de los códigos de "falta" de la triple coincidencia (igual que en
// la página de Validación) para decir qué reporte hace falta.
const MISSING_LABEL = {
  professor: 'Falta el reporte del profesor (no registró al asistente)',
  assistant: 'Falta la confirmación del asistente',
  assistant_mismatch: 'El asistente confirmado no coincide con el que reportó el profesor',
  coordinator: 'Falta la validación/coincidencia del coordinador',
};

const rowBtn = { minHeight: 26, padding: '0 8px', fontSize: '0.72rem' };

// Estado derivado de un CostRecord para el flujo Aprobado → Pagado.
// Verde = coincidencia total (habilitado); rojo = conflicto/retención.
function recordState(r) {
  if (r.payStatus === 'PENDING_MATCH' || r.payStatus === 'SUSPENDED_LATE') {
    return { key: 'CONFLICT', label: r.payStatus === 'SUSPENDED_LATE' ? 'Retenido (tardío)' : 'Conflicto', color: 'var(--red)', bg: 'rgba(232,82,106,0.12)' };
  }
  if (r.paidAt) return { key: 'PAID', label: '✓ Pagado', color: 'var(--green)', bg: 'rgba(31,169,113,0.16)' };
  if (r.approvedAt) return { key: 'APPROVED', label: 'Aprobado', color: 'var(--green)', bg: 'rgba(31,169,113,0.14)' };
  if (r.heldAt) return { key: 'HELD', label: 'Retenido', color: '#6F7BA6', bg: 'rgba(111,123,166,0.14)' };
  return { key: 'PENDING', label: 'Por validar', color: '#B4780A', bg: 'rgba(232,162,59,0.16)' };
}

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
      toast.error(err.message);
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
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleApprove(record, payeeId, approved) {
    try {
      await api.patch(`/payroll/records/${record.id}/approved`, { approved });
      await refreshDetail(payeeId);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleHold(record, payeeId, held) {
    try {
      await api.patch(`/payroll/records/${record.id}/held`, { held });
      await refreshDetail(payeeId);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  // "Validar todo" de un beneficiario: aprueba todas sus clases habilitadas y
  // pendientes de aprobar. Necesita el detalle cargado; si no, lo trae.
  async function handleValidateAll(payeeId) {
    let detail = detailMap[payeeId];
    if (!detail) { await refreshDetail(payeeId); detail = (await api.get('/payroll', { period, payeeId })).find?.((d) => d.payeeId === payeeId); }
    const ids = (detail?.records || [])
      .filter((r) => r.payStatus === 'PAYABLE' && !r.approvedAt && !r.paidAt && !r.heldAt)
      .map((r) => r.id);
    if (ids.length === 0) { toast.info('No hay pagos pendientes por aprobar de este beneficiario.'); return; }
    try {
      const r = await api.post('/payroll/records/bulk', { ids, action: 'approve' });
      await refreshDetail(payeeId);
      await load();
      toast.success(`${r.updated} pago(s) aprobado(s).`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleClose() {
    if (!confirm(`¿Cerrar la quincena ${period}?\n\nSe congela la liquidación: no se podrán editar reportes ni pagos, los pagos suspendidos pasan a la siguiente quincena, y queda registrado. Podrás reabrirla si hace falta.`)) return;
    setApproving(true);
    try {
      const r = await api.post('/payroll/close', { period });
      await load();
      if (r?.carried > 0) toast.success(`Quincena cerrada. ${r.carried} clase(s) suspendida(s) se arrastraron a ${r.nextPeriod}.`);
    } catch (err) {
      toast.error(err.message);
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
      toast.error(err.message);
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
      toast.error(err.message);
    }
  }

  // Motivo por el que un pago de asistente sigue PENDING_MATCH (retenido): qué
  // reporte falta de la triple coincidencia. El servidor calcula `assistantMissing`
  // (misma fuente que la cola de validación); aquí solo traducimos a texto.
  function pendingReason(r) {
    if (r.payeeType !== 'ASSISTANT' || r.payStatus !== 'PENDING_MATCH') return null;
    const missing = r.assistantMissing || [];
    if (missing.length === 0) {
      // Coincide todo por estado actual pero el costo aún está retenido:
      // suele faltar la validación del coordinador (o recalcular). Guiamos allí.
      return ['Falta la validación del coordinador (revísala en Validación).'];
    }
    return missing.map((m) => MISSING_LABEL[m] || m);
  }

  function DetailRows({ detail, payeeId }) {
    return (
      <>
        {detail.records?.map((r) => {
          const st = recordState(r);
          const reason = pendingReason(r);
          return (
            <div key={r.id} style={{ padding: '6px 0 8px', borderLeft: `3px solid ${st.color}`, paddingLeft: 8, marginBottom: 4 }}>
              <div className="cost-row text-sm">
                <span>
                  {fmtDate(r.session.date, { day: 'numeric', month: 'short' })}
                  {' · '}{r.session.group?.code || r.session.title}
                  {r.presentCount > 0 && <span className="text-gray"> · {r.presentCount} est.</span>}
                  <span className="badge" style={{ marginLeft: 6, background: st.bg, color: st.color }}>{st.label}</span>
                  {r.carriedFromPeriod && <span className="badge badge-gray" style={{ marginLeft: 6 }}>arrastrada de {r.carriedFromPeriod}</span>}
                </span>
                <span>{fmt(r.total)}</span>
              </div>
              {reason && reason.map((line, i) => (
                <div key={i} className="text-xs" style={{ color: 'var(--text-soft)', paddingLeft: 2, marginTop: 2 }}>
                  ⓘ {line}
                </div>
              ))}
              {!locked && (
                <div className="flex gap-1 mt-1" style={{ flexWrap: 'wrap' }}>
                  {/* Conflicto (no PAYABLE): solo desbloquear si es reporte tardío */}
                  {st.key === 'CONFLICT' && r.payStatus === 'SUSPENDED_LATE' && (
                    <button className="btn btn-ghost" style={rowBtn}
                      onClick={() => handleUnlock(r.sessionId, payeeId)}>🔓 Desbloquear pago</button>
                  )}
                  {/* Por validar → Aprobar o Retener */}
                  {st.key === 'PENDING' && (
                    <>
                      <button className="btn btn-success" style={rowBtn} onClick={() => handleApprove(r, payeeId, true)}>✓ Validar</button>
                      <button className="btn btn-ghost" style={{ ...rowBtn, color: 'var(--red)' }} onClick={() => handleHold(r, payeeId, true)}>Retener</button>
                    </>
                  )}
                  {/* Retenido → reactivar (aprobar) */}
                  {st.key === 'HELD' && (
                    <button className="btn btn-success" style={rowBtn} onClick={() => handleApprove(r, payeeId, true)}>✓ Validar</button>
                  )}
                  {/* Aprobado → Marcar pago o quitar aprobación */}
                  {st.key === 'APPROVED' && (
                    <>
                      <button className="btn btn-ghost" style={{ ...rowBtn, color: 'var(--green)' }} onClick={() => handleMarkPaid(r, payeeId)}>💵 Marcar pago realizado</button>
                      <button className="btn btn-ghost" style={{ ...rowBtn, color: 'var(--red)' }} onClick={() => handleApprove(r, payeeId, false)}>Quitar aprobación</button>
                    </>
                  )}
                  {/* Pagado → deshacer */}
                  {st.key === 'PAID' && (
                    <button className="btn btn-ghost" style={{ ...rowBtn, color: 'var(--red)' }} onClick={() => handleMarkPaid(r, payeeId)}>Deshacer pago</button>
                  )}
                </div>
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
        {(s.pendingApprovalCount || 0) > 0 && !locked && (
          <div className="flex items-center justify-between mt-2" onClick={(e) => e.stopPropagation()}>
            <span className="badge badge-yellow">{s.pendingApprovalCount} por validar</span>
            <button className="btn btn-outline" style={{ minHeight: 30, fontSize: '0.75rem', padding: '0 10px' }}
              onClick={() => handleValidateAll(s.payeeId)}>Validar todo</button>
          </div>
        )}
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
              <th style={{ textAlign: 'right' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const detail = detailMap[s.payeeId];
              const retained = (s.suspendedTotal || 0) + (s.pendingTotal || 0);
              const isOpen = expanded === s.payeeId;
              const pend = s.pendingApprovalCount || 0;
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
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      {pend > 0 ? (
                        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                          <span className="badge badge-yellow">{pend} por validar</span>
                          {!locked && <button className="btn btn-outline" style={{ minHeight: 28, fontSize: '0.72rem', padding: '0 8px' }}
                            onClick={() => handleValidateAll(s.payeeId)}>Validar todo</button>}
                        </div>
                      ) : (
                        <span className="badge badge-green">✓ Todo validado</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && detail && (
                    <tr>
                      <td></td>
                      <td colSpan={5} style={{ background: 'var(--gray-50)' }}>
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
              <td></td>
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

        {loading ? <div className="spinner" /> : (
          <>
            {/* Progreso de validación */}
            {summaryData?.progress && summaryData.progress.total > 0 && (() => {
              const p = summaryData.progress;
              const pct = Math.round((p.validated / p.total) * 100);
              return (
                <div className="card mb-3">
                  <div className="flex items-center justify-between mb-1" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <strong>Progreso de validación</strong>
                    <span className="text-sm text-gray">
                      <strong style={{ color: 'var(--green)' }}>{p.validated}</strong> de {p.total} pagos validados · {p.pending} pendientes
                      {p.conflict > 0 && <> · <span style={{ color: 'var(--red)' }}>{p.conflict} en conflicto</span></>}
                    </span>
                  </div>
                  <div className="load-bar" style={{ height: 10 }}>
                    <span style={{ width: `${pct}%`, background: 'var(--green)' }} />
                  </div>
                </div>
              );
            })()}

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
                        {(summaryData?.progress?.pending || 0) > 0
                          ? `Faltan ${summaryData.progress.pending} pago(s) por validar o retener antes de cerrar.`
                          : 'Congela la liquidación, arrastra los suspendidos a la siguiente quincena y bloquea la edición. Reversible.'}
                      </div>
                    </div>
                    <button className="btn btn-success" style={{ minHeight: 40 }}
                      onClick={handleClose} disabled={approving || (summaryData?.progress?.pending || 0) > 0}>
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
