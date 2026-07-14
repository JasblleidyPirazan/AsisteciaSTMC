import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';

// Visión Estratégica (solo Admin/Superadmin): los indicadores fundamentales de
// la Escuela en una sola pantalla — estudiantes, ocupación por grupo,
// operación de clases, riesgo de deserción y resultado financiero. Los datos
// vienen agregados de GET /reports/strategy (semestre activo o últimos 90 días).

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

const BALL_COLOR = { Roja: '#E8526A', Naranja: '#EA8A2E', Verde: '#1FA971', Amarilla: '#E8A23B' };

// Semáforo: ocupación y asistencia altas = verde; bajas = rojo (oportunidad/riesgo).
function trafficColor(pct, { good = 80, warn = 50 } = {}) {
  if (pct == null) return 'var(--gray-400)';
  if (pct >= good) return 'var(--green)';
  if (pct >= warn) return 'var(--yellow)';
  return 'var(--red)';
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

function PctBar({ pct }) {
  return (
    <div className="flex items-center gap-2">
      <div className="load-bar" style={{ flex: 1, minWidth: 60 }}>
        <span style={{ width: `${Math.min(100, pct || 0)}%`, background: trafficColor(pct) }} />
      </div>
      <span className="text-sm font-medium" style={{ color: trafficColor(pct), width: 42, textAlign: 'right' }}>
        {pct != null ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

export default function StrategyPage() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/strategy').then(setD).catch(() => setD(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page page-wide">
      <div className="page-content" style={{ paddingTop: 8 }}>
        <div className="flex items-center justify-between mb-4" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2">
            <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
            <div>
              <h1 style={{ fontSize: '1.9rem' }}>🎯 Visión Estratégica</h1>
              <p className="text-gray text-sm">
                {d?.semester
                  ? `${d.semester.name} · ${fmtDate(d.semester.startDate)} – ${fmtDate(d.semester.endDate)}`
                  : 'Últimos 90 días (sin semestre activo)'}
              </p>
            </div>
          </div>
        </div>

        {!d ? (
          <div className="alert alert-info">No se pudo cargar la información.</div>
        ) : (
          <>
            {/* ===== Indicadores principales ===== */}
            <div className="home-kpis">
              <StatCard icon="👥" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
                label="Estudiantes activos" value={d.students.active}
                sub={`+${d.students.newThisPeriod} nuevos en el período`} subColor="var(--success)" />
              <StatCard icon="🎾" tint={{ bg: 'rgba(79,159,178,0.14)', fg: '#4F9FB2' }}
                label="Ocupación de grupos" value={d.groups.occupancyPct != null ? `${d.groups.occupancyPct}%` : '—'}
                sub={`${d.groups.totalEnrolled}/${d.groups.totalCapacity} cupos · ${d.groups.freeSpots} libres`}
                subColor={trafficColor(d.groups.occupancyPct)} />
              <StatCard icon="✓" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
                label="Asistencia promedio" value={d.operations.avgAttendance != null ? `${d.operations.avgAttendance}%` : '—'}
                sub="presentes vs ausentes" subColor={trafficColor(d.operations.avgAttendance)} />
              <StatCard icon={d.finance.net >= 0 ? '📈' : '📉'}
                tint={d.finance.net >= 0 ? { bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' } : { bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                label="Resultado del período" value={fmt(d.finance.net)}
                sub={d.finance.marginPct != null ? `margen ${d.finance.marginPct}%` : 'sin ingresos registrados'}
                subColor={d.finance.net >= 0 ? 'var(--success)' : 'var(--red)'} />
            </div>

            {/* ===== Segunda fila: conversión, operación, riesgo, prospectos ===== */}
            <div className="home-kpis">
              <StatCard icon="🎓" tint={{ bg: 'rgba(122,90,248,0.14)', fg: '#7A5AF8' }}
                label="Conversión de matrícula" value={d.students.conversionPct != null ? `${d.students.conversionPct}%` : '—'}
                sub={`${d.students.matriculados} matriculados · ${d.students.inscritos} con pago pendiente`}
                subColor={d.students.inscritos > 0 ? 'var(--warning)' : 'var(--success)'} />
              <StatCard icon="🗓️" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
                label="Cumplimiento de clases" value={d.operations.compliancePct != null ? `${d.operations.compliancePct}%` : '—'}
                sub={`${d.operations.realized} realizadas · ${d.operations.cancelled} canceladas (${d.operations.cancelledRain} 🌧️)`}
                subColor={trafficColor(d.operations.compliancePct, { good: 90, warn: 75 })} />
              <StatCard icon="🚨" tint={{ bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                label="Riesgo de deserción" value={d.alerts.red + d.alerts.yellow}
                sub={`${d.alerts.red} alerta roja · ${d.alerts.yellow} amarilla`}
                subColor={d.alerts.red > 0 ? 'var(--red)' : d.alerts.yellow > 0 ? 'var(--warning)' : 'var(--success)'} />
              <StatCard icon="🧪" tint={{ bg: 'rgba(232,162,59,0.14)', fg: '#E8A23B' }}
                label="Clases de prueba" value={d.students.trial}
                sub={d.students.trial > 0 ? 'prospectos por convertir' : 'sin prospectos pendientes'}
                subColor={d.students.trial > 0 ? 'var(--warning)' : 'var(--text-soft)'} />
            </div>

            {/* ===== Finanzas en detalle ===== */}
            <div className="card mb-4">
              <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: 6 }}>
                <h3>💰 Finanzas del período</h3>
                <button className="btn btn-ghost" style={{ minHeight: 30, fontSize: '0.8rem' }}
                  onClick={() => navigate('/admin/accounting')}>Ver Contabilidad →</button>
              </div>
              <div className="stats-row">
                <div className="stat-box"><div className="num" style={{ color: 'var(--green)', fontSize: '1rem' }}>{fmt(d.finance.income)}</div><div className="lbl">Ingresos · {d.finance.paymentsCount} pagos (todos)</div></div>
                <div className="stat-box"><div className="num" style={{ color: 'var(--red)', fontSize: '1rem' }}>{fmt(d.finance.expensesAccrued)}</div><div className="lbl">Gasto causado</div></div>
                <div className="stat-box"><div className="num" style={{ fontSize: '1rem' }}>{fmt(d.finance.expensesPaid)}</div><div className="lbl">Ya pagado</div></div>
                <div className="stat-box"><div className="num" style={{ color: d.finance.expensesRetained > 0 ? 'var(--yellow)' : 'inherit', fontSize: '1rem' }}>{fmt(d.finance.expensesRetained)}</div><div className="lbl">Retenido</div></div>
              </div>
            </div>

            {/* ===== Contadores por grupo ===== */}
            <div className="flex items-center justify-between mb-2">
              <h2>Contadores por grupo</h2>
              <span className="badge badge-blue">{d.groups.count} grupos</span>
            </div>
            {d.groups.rows.length === 0 ? (
              <div className="alert alert-info">No hay grupos activos.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Grupo</th><th>Profesor</th><th className="num">Estudiantes</th>
                      <th style={{ minWidth: 130 }}>Ocupación</th><th style={{ minWidth: 130 }}>Asistencia</th>
                      <th className="num">Realizadas</th><th className="num">Canceladas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.groups.rows.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <div className="font-medium">
                            {g.ballLevel && <span className="legend-dot" style={{ background: BALL_COLOR[g.ballLevel] || 'var(--gray-400)', marginRight: 6 }} />}
                            {g.code}
                          </div>
                          <div className="text-xs text-gray">{g.ballLevel || ''}{g.subLevel ? ` ${g.subLevel}` : ''}</div>
                        </td>
                        <td className="text-sm">{g.professor}</td>
                        <td className="num font-medium">{g.students}/{g.capacity}</td>
                        <td><PctBar pct={g.occupancyPct} /></td>
                        <td><PctBar pct={g.attendanceRate} /></td>
                        <td className="num">{g.realized}</td>
                        <td className="num" style={{ color: g.cancelled > 0 ? 'var(--red)' : 'var(--gray-400)' }}>
                          {g.cancelled > 0 ? `${g.cancelled}${g.cancelledRain > 0 ? ` (${g.cancelledRain} 🌧️)` : ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total · {d.groups.count} grupos</td>
                      <td></td>
                      <td className="num">{d.groups.totalEnrolled}/{d.groups.totalCapacity}</td>
                      <td><PctBar pct={d.groups.occupancyPct} /></td>
                      <td><PctBar pct={d.operations.avgAttendance} /></td>
                      <td className="num">{d.operations.realized}</td>
                      <td className="num">{d.operations.cancelled || '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <p className="text-xs text-gray mt-3">
              Ocupación baja = cupos por vender · Asistencia = presentes vs ausentes (las justificadas no penalizan) ·
              Resultado = todos los pagos registrados − gastos causados del período (los retenidos no cuentan hasta habilitarse).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
