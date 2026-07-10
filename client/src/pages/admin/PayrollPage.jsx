import { useState, useEffect } from 'react';
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

// Colores de ayuda por clase, mapeados al estado de pago que ya calcula el sistema.
const PAY_STATUS = {
  PAYABLE: { color: 'var(--green)', label: 'Habilitado' },
  SUSPENDED_LATE: { color: 'var(--gray-400)', label: 'Reporte tardío' },
  PENDING_MATCH: { color: 'var(--red)', label: 'Sin coincidencia' },
};

function buildPeriodOptions() {
  const options = [];
  const now = new Date();
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

function markKey(sessionId, payeeType, payeeId) {
  return `${sessionId}|${payeeType}|${payeeId}`;
}

export default function PayrollPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [payees, setPayees] = useState([]);
  const [approval, setApproval] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingMarks, setPendingMarks] = useState({});
  const [savingMarks, setSavingMarks] = useState(false);
  const [approving, setApproving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [data, summary] = await Promise.all([
        api.get('/payroll', { period }),
        api.get('/payroll/summary', { period }),
      ]);
      setPayees(Array.isArray(data) ? data : []);
      setApproval(summary?.approval || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); setPendingMarks({}); }, [period]);

  const professors = payees.filter((p) => p.payeeType === 'PROFESSOR');
  const assistants = payees.filter((p) => p.payeeType === 'ASSISTANT');

  function isPaid(r, s) {
    const k = markKey(r.sessionId, s.payeeType, s.payeeId);
    return k in pendingMarks ? pendingMarks[k] : !!r.paid;
  }

  function togglePaid(r, s) {
    const k = markKey(r.sessionId, s.payeeType, s.payeeId);
    const original = !!r.paid;
    const cur = k in pendingMarks ? pendingMarks[k] : original;
    const desired = !cur;
    setPendingMarks((prev) => {
      const next = { ...prev };
      if (desired === original) delete next[k];
      else next[k] = desired;
      return next;
    });
  }

  const dirtyCount = Object.keys(pendingMarks).length;

  async function handleSaveMarks() {
    const marks = [];
    for (const s of payees) {
      for (const r of s.records) {
        const k = markKey(r.sessionId, s.payeeType, s.payeeId);
        if (k in pendingMarks) {
          marks.push({ sessionId: r.sessionId, payeeType: s.payeeType, payeeId: s.payeeId, period, paid: pendingMarks[k] });
        }
      }
    }
    if (marks.length === 0) return;
    setSavingMarks(true);
    try {
      await api.post('/payroll/mark', { marks });
      setPendingMarks({});
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingMarks(false);
    }
  }

  async function handleUnlock(sessionId) {
    if (!confirm('¿Desbloquear el pago de esta clase reportada tarde?')) return;
    try {
      await api.post(`/sessions/${sessionId}/unlock-payment`, {});
      await load();
    } catch (err) {
      alert(err.message);
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

  async function handleApprove() {
    if (!confirm(`¿Aprobar (cerrar) la liquidación del período ${period}? Quedará registrado con tu cuenta y la fecha actual.`)) return;
    setApproving(true);
    try { await api.post('/payroll/approve', { period }); await load(); }
    catch (err) { alert(err.message); } finally { setApproving(false); }
  }

  async function handleRevert() {
    if (!confirm('¿Revertir la aprobación de esta quincena?')) return;
    setApproving(true);
    try { await api.delete(`/payroll/approve?period=${encodeURIComponent(period)}`); await load(); }
    catch (err) { alert(err.message); } finally { setApproving(false); }
  }

  // Tabla por beneficiario con el detalle de cada clase + check de pago.
  function PayeeBlock({ s }) {
    const paidCount = s.records.filter((r) => r.payStatus === 'PAYABLE' && isPaid(r, s)).length;
    const payableCount = s.records.filter((r) => r.payStatus === 'PAYABLE').length;
    return (
      <div className="card mb-3">
        <div className="flex items-center justify-between mb-2" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-gray">
              {paidCount}/{payableCount} pagadas · {s.records.length} clase{s.records.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="cost-total">{fmt(s.payableTotal ?? s.total)}</div>
            <div className="text-xs text-gray">habilitado</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Clase</th><th className="num">Pres.</th>
                <th className="num">Tarifa</th><th className="num">Total</th><th>Estado</th><th className="num">Pagado</th>
              </tr>
            </thead>
            <tbody>
              {s.records.map((r) => {
                const st = PAY_STATUS[r.payStatus] || PAY_STATUS.PAYABLE;
                const paid = isPaid(r, s);
                return (
                  <tr key={r.id} style={{ borderLeft: `3px solid ${st.color}` }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.session.date, { day: 'numeric', month: 'short' })}</td>
                    <td>{r.session.group?.code || r.session.title || 'Reposición'}</td>
                    <td className="num">{r.presentCount || '—'}</td>
                    <td className="num">{fmt(r.rate)}</td>
                    <td className="num font-medium">{fmt(r.total)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className="legend-dot" style={{ background: st.color }} /> {st.label}
                      {r.payStatus === 'SUSPENDED_LATE' && (
                        <button className="btn btn-ghost" style={{ minHeight: 24, padding: '0 6px', fontSize: '0.7rem', marginLeft: 4 }}
                          onClick={() => handleUnlock(r.sessionId)}>🔓</button>
                      )}
                    </td>
                    <td className="num">
                      {r.payStatus === 'PAYABLE' ? (
                        <input type="checkbox" checked={paid} onChange={() => togglePaid(r, s)}
                          style={{ width: 20, height: 20, cursor: 'pointer' }} />
                      ) : (
                        <span className="text-xs text-gray">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Tabla general: una fila por beneficiario + gran total que suma todo.
  function SummaryTable() {
    const rows = payees.map((s) => {
      const livePaid = s.records
        .filter((r) => r.payStatus === 'PAYABLE' && isPaid(r, s))
        .reduce((x, r) => x + parseFloat(r.total), 0);
      const retained = (s.suspendedTotal || 0) + (s.pendingTotal || 0);
      return { key: `${s.payeeType}-${s.payeeId}`, name: s.name, type: s.payeeType, classCount: s.records.length, payable: s.payableTotal ?? 0, paid: livePaid, retained };
    });
    const grand = rows.reduce((a, r) => {
      a.classCount += r.classCount; a.payable += r.payable; a.paid += r.paid; a.retained += r.retained; return a;
    }, { classCount: 0, payable: 0, paid: 0, retained: 0 });
    return (
      <div className="table-wrap mb-4">
        <table className="data-table">
          <thead>
            <tr>
              <th>Beneficiario</th><th className="num">Clases</th>
              <th className="num">Habilitado</th><th className="num">Pagado</th><th className="num">Retenido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="font-medium">{r.name} <span className="text-xs text-gray">· {r.type === 'PROFESSOR' ? 'Profe' : 'Asist.'}</span></td>
                <td className="num">{r.classCount}</td>
                <td className="num" style={{ color: 'var(--blue)' }}>{fmt(r.payable)}</td>
                <td className="num" style={{ color: r.paid > 0 ? 'var(--green)' : 'var(--gray-400)' }}>{r.paid > 0 ? fmt(r.paid) : '—'}</td>
                <td className="num" style={{ color: r.retained > 0 ? 'var(--red)' : 'var(--gray-400)' }}>{r.retained > 0 ? fmt(r.retained) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="font-medium">Gran total</td>
              <td className="num">{grand.classCount}</td>
              <td className="num font-medium" style={{ color: 'var(--blue)' }}>{fmt(grand.payable)}</td>
              <td className="num font-medium" style={{ color: 'var(--green)' }}>{fmt(grand.paid)}</td>
              <td className="num font-medium" style={{ color: grand.retained > 0 ? 'var(--red)' : 'inherit' }}>{grand.retained > 0 ? fmt(grand.retained) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  const hasItems = payees.length > 0;

  return (
    <div className="page page-wide">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Liquidación</h1>
      </div>

      <div className="page-content">
        <div className="flex items-center justify-between mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 220, flex: 1 }}>
            <label className="form-label">Período (quincena)</label>
            <select className="form-input form-select" value={period}
              onChange={(e) => setPeriod(e.target.value)}>
              {buildPeriodOptions().map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-outline" style={{ minHeight: 40, padding: '0 14px', fontSize: '0.875rem' }}
            onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exportando...' : '⬇ Exportar Excel'}
          </button>
        </div>

        {/* Leyenda de colores */}
        <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap', fontSize: '0.78rem' }}>
          <span className="text-gray"><span className="legend-dot" style={{ background: 'var(--green)' }} /> Habilitado</span>
          <span className="text-gray"><span className="legend-dot" style={{ background: 'var(--gray-400)' }} /> Reporte tardío</span>
          <span className="text-gray"><span className="legend-dot" style={{ background: 'var(--red)' }} /> Sin coincidencia (profe vs. coordinador)</span>
        </div>

        {loading ? <div className="spinner" /> : !hasItems ? (
          <div className="alert alert-info">No hay registros de pago para este período.</div>
        ) : (
          <>
            {/* Barra de guardado de pagos */}
            <div className="action-bar-inline flex items-center justify-between mb-3" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="text-sm text-gray">
                {dirtyCount > 0 ? `${dirtyCount} cambio${dirtyCount !== 1 ? 's' : ''} sin guardar` : 'Marca las clases pagadas y guarda'}
              </span>
              <button className="btn btn-success" style={{ minHeight: 40, padding: '0 16px' }}
                onClick={handleSaveMarks} disabled={savingMarks || dirtyCount === 0}>
                {savingMarks ? 'Guardando...' : '💾 Guardar pagos'}
              </button>
            </div>

            {/* Tabla general resumen */}
            <h3 className="mb-2" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resumen general</h3>
            <SummaryTable />

            {/* Hoja para profes: una tabla por profesor con el detalle de sus clases */}
            {professors.length > 0 && (
              <>
                <h3 className="mb-2" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profesores</h3>
                {professors.map((s) => <PayeeBlock key={s.payeeId} s={s} />)}
              </>
            )}

            {assistants.length > 0 && (
              <>
                <h3 className="mb-2 mt-3" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asistentes</h3>
                {assistants.map((s) => <PayeeBlock key={s.payeeId} s={s} />)}
              </>
            )}

            {/* Cierre opcional de la quincena (auditoría) */}
            <div className="mt-4">
              {approval ? (
                <div className="card" style={{ borderColor: 'var(--green)', background: 'var(--green-light)' }}>
                  <div className="flex items-center justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div className="font-medium" style={{ color: 'var(--green)' }}>✅ Quincena cerrada</div>
                      <div className="text-xs text-gray mt-1">Por {approval.approvedByName || '—'} · {fmtDateTime(approval.approvedAt)}</div>
                      <div className="text-xs text-gray">Total aprobado: {fmt(approval.totalPayable)}{approval.totalRetained > 0 && ` · Retenido: ${fmt(approval.totalRetained)}`}</div>
                    </div>
                    <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem', color: 'var(--red)' }}
                      onClick={handleRevert} disabled={approving}>Revertir</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-outline btn-full" style={{ fontSize: '0.875rem' }}
                  onClick={handleApprove} disabled={approving}>
                  {approving ? 'Cerrando...' : 'Cerrar quincena (opcional)'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
