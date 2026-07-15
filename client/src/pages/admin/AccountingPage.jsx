import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate, bogotaTodayStr } from '../../utils/dates';
import { periodLabel } from '../../utils/periods';
import { toast } from '../../utils/toast';

// Módulo de Contabilidad (solo Admin/Superadmin):
//   Ingresos = pagos de estudiantes, con verificación (conciliación) por pago.
//   Gastos   = liquidación a profesores/asistentes agrupada por quincena.
//   Balance  = ingresos vs gastos causados por mes, con resultado acumulado.

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

const METHOD_LABEL = { TRANSFERENCIA: 'Transferencia', EFECTIVO: 'Efectivo', WOMPI: 'Wompi', BOLD: 'Bold' };
const METHOD_BADGE = { TRANSFERENCIA: 'badge-blue', EFECTIVO: 'badge-green', WOMPI: 'badge-yellow', BOLD: 'badge-gray' };

// Límites de mes anclados al día de Bogotá (bogotaTodayStr de utils/dates).
function monthRange(offset = 0) {
  const [y, m] = bogotaTodayStr().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  const first = d.toISOString().slice(0, 10);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { from: first, to: last };
}
function dateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

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

const TABS = [
  { key: 'income', label: '💵 Ingresos' },
  { key: 'expenses', label: '📤 Gastos' },
  { key: 'balance', label: '⚖️ Balance' },
];

export default function AccountingPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('income');
  const [semester, setSemester] = useState(null);
  const [range, setRange] = useState(null); // { from, to }
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Rango inicial: el semestre activo si existe; si no, el mes actual.
  useEffect(() => {
    api.get('/semesters/active')
      .then((s) => {
        setSemester(s);
        if (s?.startDate && s?.endDate) setRange({ from: dateStr(s.startDate), to: dateStr(s.endDate) });
        else setRange(monthRange());
      })
      .catch(() => { setSemester(null); setRange(monthRange()); });
  }, []);

  useEffect(() => {
    if (!range) return;
    setLoading(true);
    api.get('/accounting/summary', range)
      .then(setData)
      .catch((err) => { console.error(err); setData(null); })
      .finally(() => setLoading(false));
  }, [range]);

  async function handleVerify(payment) {
    try {
      const r = await api.patch(`/accounting/payments/${payment.id}/verified`, { verified: !payment.verifiedAt });
      setData((prev) => {
        if (!prev) return prev;
        const payments = prev.income.payments.map((p) =>
          p.id === payment.id ? { ...p, verifiedAt: r.verifiedAt, verifiedByName: r.verifiedByName } : p
        );
        // Recalcular los totales de verificación en el cliente para no recargar todo.
        let verifiedTotal = 0, verifiedCount = 0, unverifiedTotal = 0, unverifiedCount = 0;
        for (const p of payments) {
          if (p.verifiedAt) { verifiedTotal += p.amount; verifiedCount += 1; }
          else { unverifiedTotal += p.amount; unverifiedCount += 1; }
        }
        return { ...prev, income: { ...prev.income, payments, verifiedTotal, verifiedCount, unverifiedTotal, unverifiedCount } };
      });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const token = localStorage.getItem('stmc_token');
      const res = await fetch(`/api/accounting/export?from=${range.from}&to=${range.to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contabilidad-${range.from}-a-${range.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  const income = data?.income;
  const expenses = data?.expenses;
  const balance = data?.balance;

  return (
    <div className="page page-wide">
      <div className="page-content" style={{ paddingTop: 8 }}>
        {/* Encabezado */}
        <div className="flex items-center justify-between mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
            <div>
              <h1 style={{ fontSize: '1.9rem' }}>Contabilidad</h1>
              <p className="text-gray text-sm">Ingresos, gastos y balance de la academia</p>
            </div>
          </div>
          <button className="btn btn-outline" style={{ minHeight: 40 }} onClick={handleExport}
            disabled={exporting || !range}>
            {exporting ? 'Exportando…' : '⬇ Excel (3 hojas)'}
          </button>
        </div>

        {/* Filtro de rango */}
        {range && (
          <div className="card mb-3">
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem' }}
                onClick={() => setRange(monthRange())}>Este mes</button>
              <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem' }}
                onClick={() => setRange(monthRange(-1))}>Mes anterior</button>
              {semester && (
                <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem' }}
                  onClick={() => setRange({ from: dateStr(semester.startDate), to: dateStr(semester.endDate) })}>
                  Semestre ({semester.name})
                </button>
              )}
              <div className="flex items-center gap-2" style={{ marginLeft: 'auto', flexWrap: 'wrap' }}>
                <input type="date" className="form-input" style={{ width: 'auto', minHeight: 34, fontSize: '0.85rem' }}
                  value={range.from} max={range.to}
                  onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
                <span className="text-gray text-sm">a</span>
                <input type="date" className="form-input" style={{ width: 'auto', minHeight: 34, fontSize: '0.85rem' }}
                  value={range.to} min={range.from}
                  onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {/* Pestañas */}
        <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.key} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}
              style={{ minHeight: 38 }} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {loading || !range ? <div className="spinner" /> : !data ? (
          <div className="alert alert-info">No se pudo cargar la información contable.</div>
        ) : (
          <>
            {/* ===== Hoja 1: Ingresos ===== */}
            {tab === 'income' && (
              <>
                <div className="home-kpis">
                  <StatCard icon="💵" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
                    label="Total de ingresos" value={fmt(income.total)}
                    sub={`${income.count} pago${income.count !== 1 ? 's' : ''} registrados`} />
                  <StatCard icon="✓" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
                    label="Verificado" value={fmt(income.verifiedTotal)}
                    sub={`${income.verifiedCount} pago${income.verifiedCount !== 1 ? 's' : ''} conciliados`} subColor="var(--success)" />
                  <StatCard icon="⏳" tint={{ bg: 'rgba(232,162,59,0.14)', fg: '#E8A23B' }}
                    label="Sin verificar" value={fmt(income.unverifiedTotal)}
                    sub={income.unverifiedCount > 0 ? `${income.unverifiedCount} por conciliar` : 'todo conciliado'}
                    subColor={income.unverifiedCount > 0 ? 'var(--warning)' : 'var(--success)'} />
                  <StatCard icon="🏦" tint={{ bg: 'rgba(79,159,178,0.14)', fg: '#4F9FB2' }}
                    label="Efectivo recibido" value={fmt(income.byMethod?.EFECTIVO?.total || 0)}
                    sub="para arqueo de caja" />
                </div>

                {/* Desglose por medio de pago (conciliación bancaria) */}
                {Object.keys(income.byMethod || {}).length > 0 && (
                  <div className="card mb-3">
                    <h3 className="mb-2">Por medio de pago</h3>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr><th>Medio</th><th className="num">Pagos</th><th className="num">Total</th><th className="num">Verificado</th></tr>
                        </thead>
                        <tbody>
                          {Object.entries(income.byMethod).map(([method, m]) => (
                            <tr key={method}>
                              <td><span className={`badge ${METHOD_BADGE[method] || 'badge-gray'}`}>{METHOD_LABEL[method] || method}</span></td>
                              <td className="num">{m.count}</td>
                              <td className="num font-medium">{fmt(m.total)}</td>
                              <td className="num" style={{ color: m.verifiedTotal < m.total ? 'var(--warning)' : 'var(--success)' }}>
                                {fmt(m.verifiedTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Detalle de pagos con verificación */}
                {income.payments.length === 0 ? (
                  <div className="alert alert-info">No hay pagos registrados en este rango.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Fecha</th><th>Estudiante</th><th>Medio</th><th>Recibido por</th>
                          <th className="num">Monto</th><th style={{ textAlign: 'center' }}>Verificado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {income.payments.map((p) => (
                          <tr key={p.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.paymentDate, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                            <td>
                              {p.student?.id ? (
                                <button className="link-name font-medium"
                                  onClick={() => navigate('/admin/students', { state: { focusStudentId: p.student.id, from: { label: 'Contabilidad', to: '/admin/accounting' } } })}
                                  title="Ver ficha del estudiante">
                                  {p.student.name} ›
                                </button>
                              ) : (
                                <div className="font-medium">{p.student?.name}</div>
                              )}
                              {p.note && <div className="text-xs text-gray">{p.note}</div>}
                            </td>
                            <td><span className={`badge ${METHOD_BADGE[p.method] || 'badge-gray'}`}>{METHOD_LABEL[p.method] || p.method}</span></td>
                            <td className="text-sm text-gray">{p.receivedByName || '—'}</td>
                            <td className="num font-medium">{fmt(p.amount)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <label className="flex items-center gap-2" style={{ justifyContent: 'center', cursor: 'pointer' }}
                                title={p.verifiedAt ? `Verificado por ${p.verifiedByName || '—'}` : 'Marcar como verificado'}>
                                <input type="checkbox" checked={!!p.verifiedAt} onChange={() => handleVerify(p)}
                                  style={{ width: 20, height: 20, accentColor: 'var(--green, #1FA971)' }} />
                                {p.verifiedAt && <span className="badge badge-green">✓</span>}
                              </label>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4}>Total del rango</td>
                          <td className="num" style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmt(income.total)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ===== Hoja 2: Gastos ===== */}
            {tab === 'expenses' && (
              <>
                <div className="home-kpis">
                  <StatCard icon="📤" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
                    label="Gasto causado" value={fmt(expenses.totals.accruedTotal)}
                    sub={`${expenses.totals.classCount} clases liquidadas`} />
                  <StatCard icon="💸" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
                    label="Pagado" value={fmt(expenses.totals.paidTotal)}
                    sub="pago realizado" subColor="var(--success)" />
                  <StatCard icon="🕐" tint={{ bg: 'rgba(232,162,59,0.14)', fg: '#E8A23B' }}
                    label="Pendiente de pago" value={fmt(expenses.totals.unpaidTotal)}
                    sub="habilitado, aún sin pagar"
                    subColor={expenses.totals.unpaidTotal > 0 ? 'var(--warning)' : 'var(--text-soft)'} />
                  <StatCard icon="⏸" tint={{ bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                    label="Retenido" value={fmt(expenses.totals.retainedTotal)}
                    sub="suspendido / pendiente de validación"
                    subColor={expenses.totals.retainedTotal > 0 ? 'var(--red)' : 'var(--text-soft)'} />
                </div>

                {expenses.rows.length === 0 ? (
                  <div className="alert alert-info">No hay liquidaciones en este rango.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Quincena</th><th className="num">Clases</th><th className="num">Profesores</th>
                          <th className="num">Asistentes</th><th className="num">Causado</th><th className="num">Pagado</th>
                          <th className="num">Retenido</th><th>Estado</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.rows.map((r) => (
                          <tr key={r.period}>
                            <td style={{ whiteSpace: 'nowrap' }} className="font-medium">{periodLabel(r.period, semester)}</td>
                            <td className="num">{r.classCount}</td>
                            <td className="num">{fmt(r.professorsAccrued)}</td>
                            <td className="num">{fmt(r.assistantsAccrued)}</td>
                            <td className="num font-medium" style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmt(r.accruedTotal)}</td>
                            <td className="num" style={{ color: r.paidTotal >= r.accruedTotal && r.accruedTotal > 0 ? 'var(--success)' : 'inherit' }}>
                              {fmt(r.paidTotal)}
                            </td>
                            <td className="num" style={{ color: r.retainedTotal > 0 ? 'var(--red)' : 'var(--gray-400)' }}>
                              {r.retainedTotal > 0 ? fmt(r.retainedTotal) : '—'}
                            </td>
                            <td>
                              {r.locked
                                ? <span className="badge badge-gray" title={`Cerrada por ${r.closedByName || '—'}`}>🔒 Cerrada</span>
                                : <span className="badge badge-blue">Abierta</span>}
                            </td>
                            <td>
                              <button className="btn btn-ghost" style={{ minHeight: 28, fontSize: '0.75rem', padding: '0 8px' }}
                                onClick={() => navigate('/admin/payroll')}>Ver</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Total</td>
                          <td className="num">{expenses.totals.classCount}</td>
                          <td className="num">{fmt(expenses.totals.professorsAccrued)}</td>
                          <td className="num">{fmt(expenses.totals.assistantsAccrued)}</td>
                          <td className="num" style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmt(expenses.totals.accruedTotal)}</td>
                          <td className="num">{fmt(expenses.totals.paidTotal)}</td>
                          <td className="num" style={{ color: expenses.totals.retainedTotal > 0 ? 'var(--red)' : 'inherit' }}>
                            {expenses.totals.retainedTotal > 0 ? fmt(expenses.totals.retainedTotal) : '—'}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ===== Hoja 3: Balance ===== */}
            {tab === 'balance' && (
              <>
                <div className="home-kpis">
                  <StatCard icon="💵" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
                    label="Ingresos" value={fmt(balance.totals.income)}
                    sub={`verificado: ${fmt(income.verifiedTotal)}`} />
                  <StatCard icon="📤" tint={{ bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                    label="Gastos causados" value={fmt(balance.totals.expensesAccrued)}
                    sub={`pagados: ${fmt(balance.totals.expensesPaid)}`} />
                  <StatCard icon={balance.totals.net >= 0 ? '📈' : '📉'}
                    tint={balance.totals.net >= 0
                      ? { bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }
                      : { bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                    label="Resultado neto" value={fmt(balance.totals.net)}
                    sub={balance.totals.net >= 0 ? 'superávit' : 'déficit'}
                    subColor={balance.totals.net >= 0 ? 'var(--success)' : 'var(--red)'} />
                  <StatCard icon="％" tint={{ bg: 'rgba(122,90,248,0.14)', fg: '#7A5AF8' }}
                    label="Margen" value={balance.totals.marginPct != null ? `${balance.totals.marginPct.toFixed(1)}%` : '—'}
                    sub="resultado / ingresos" />
                </div>

                <div className="alert alert-info mb-3" style={{ fontSize: '0.85rem' }}>
                  <strong>Criterio contable:</strong> los gastos se miden por <em>causación</em> (todo pago habilitado
                  a profesores/asistentes es un compromiso, se haya pagado o no). Los pagos retenidos
                  ({fmt(expenses.totals.retainedTotal)}) no entran al balance hasta que se habiliten.
                  Los ingresos sin verificar ({fmt(income.unverifiedTotal)}) sí suman: verifícalos en la pestaña
                  Ingresos para confiar en la cifra.
                </div>

                {balance.rows.length === 0 ? (
                  <div className="alert alert-info">Sin movimientos en este rango.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mes</th><th className="num">Ingresos</th><th className="num">Gastos causados</th>
                          <th className="num">Gastos pagados</th><th className="num">Resultado</th><th className="num">Acumulado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balance.rows.map((r) => (
                          <tr key={r.month}>
                            <td className="font-medium" style={{ textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{monthLabel(r.month)}</td>
                            <td className="num" style={{ color: 'var(--success)' }}>{fmt(r.income)}</td>
                            <td className="num" style={{ color: 'var(--red)' }}>{fmt(r.expensesAccrued)}</td>
                            <td className="num text-gray">{fmt(r.expensesPaid)}</td>
                            <td className="num font-medium" style={{ color: r.net >= 0 ? 'var(--success)' : 'var(--red)' }}>{fmt(r.net)}</td>
                            <td className="num" style={{ color: r.cumulativeNet >= 0 ? 'var(--brand-indigo, var(--blue))' : 'var(--red)' }}>
                              {fmt(r.cumulativeNet)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Total</td>
                          <td className="num">{fmt(balance.totals.income)}</td>
                          <td className="num">{fmt(balance.totals.expensesAccrued)}</td>
                          <td className="num">{fmt(balance.totals.expensesPaid)}</td>
                          <td className="num" style={{ color: balance.totals.net >= 0 ? 'var(--success)' : 'var(--red)' }}>
                            {fmt(balance.totals.net)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
