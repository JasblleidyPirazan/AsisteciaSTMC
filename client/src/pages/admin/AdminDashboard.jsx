import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const BALL_COLOR = { Roja: '#E8526A', Naranja: '#EA8A2E', Verde: '#1FA971', Amarilla: '#E8A23B' };
const STATUS_BADGE = {
  Lista: 'badge-green', 'En curso': 'badge-blue', Próxima: 'badge-gray',
  Pendiente: 'badge-yellow', Cancelada: 'badge-red',
};
const AVATAR_COLORS = ['#3F52A8', '#4F9FB2', '#7A5AF8', '#E8A23B', '#1FA971', '#E8526A', '#6F7BA6'];

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '·';
}

// ---- Gráficos en SVG ----
function LineChart({ values }) {
  const w = 520, h = 170, pad = 22;
  const max = Math.max(1, ...values);
  const stepX = (w - pad * 2) / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [pad + i * stepX, h - pad - (v / max) * (h - pad * 2)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={pad + f * (h - pad * 2)} y2={pad + f * (h - pad * 2)}
          stroke="var(--border)" strokeDasharray="4 4" />
      ))}
      <polygon points={area} fill="var(--brand-indigo)" opacity="0.10" />
      <polyline points={line} fill="none" stroke="var(--brand-indigo)" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="5" fill="#fff" stroke="var(--brand-indigo)" strokeWidth="2.5" />
      ))}
      {pts.map((p, i) => (
        <text key={`t${i}`} x={p[0]} y={h - 5} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{DAYS[i]}</text>
      ))}
    </svg>
  );
}

function Donut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 42, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" width="128" height="128">
      <g transform="rotate(-90 50 50)">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="14" />
        {data.map((d, i) => {
          const len = (d.value / total) * C;
          const el = (
            <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={d.color} strokeWidth="14"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
      </g>
    </svg>
  );
}

function StatCard({ icon, tint, label, value, sub, subColor }) {
  return (
    <div className="card">
      <div className="kpi-ico" style={{ background: tint.bg, color: tint.fg }}>{icon}</div>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-num">{value}</div>
      {sub && <div className="kpi-sub" style={{ color: subColor || 'var(--success)' }}>{sub}</div>}
    </div>
  );
}

// Panel de bienvenida / overview de gestión (ADMIN / Coordinador / SUPERADMIN).
export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/home').then(setD).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const name = capitalize((user?.email || '').split('@')[0]) || 'Bienvenido';

  const dist = d?.distribution || { presente: 0, ausente: 0, reposicion: 0, justificado: 0 };
  const donutData = [
    { label: 'Presente', value: dist.presente, color: '#1FA971' },
    { label: 'Ausente', value: dist.ausente, color: '#E8526A' },
    { label: 'Reposición', value: dist.reposicion, color: '#3F52A8' },
    { label: 'Justificado', value: dist.justificado, color: '#E8A23B' },
  ];
  const maxLoad = Math.max(1, ...(d?.professorLoad || []).map((p) => p.groups));

  return (
    <div className="page page-wide">
      <div className="page-content" style={{ paddingTop: 8 }}>
        <div className="flex items-center justify-between mb-4" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.9rem' }}>Hola, {name}</h1>
            <p className="text-gray text-sm">Así va la escuela hoy en Santa María.</p>
          </div>
          <div className="flex items-center gap-3">
            {d?.classProgress && (
              <span className="text-sm text-gray">Clase {d.classProgress.done} de {d.classProgress.total}</span>
            )}
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              ✓ Tomar asistencia
            </button>
          </div>
        </div>

        {loading ? <div className="spinner" /> : !d ? (
          <div className="alert alert-info">No se pudo cargar el panel.</div>
        ) : (
          <>
            <div className="home-kpis">
              <StatCard icon="👥" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
                label="Estudiantes activos" value={d.students.active}
                sub={d.students.newThisSemester != null ? `+${d.students.newThisSemester} este semestre` : null} />
              <StatCard icon="🎾" tint={{ bg: 'rgba(79,159,178,0.14)', fg: '#4F9FB2' }}
                label="Grupos activos" value={d.groups.active}
                sub={`${d.groups.inactive} inactivos`} subColor="var(--text-soft)" />
              <StatCard icon="🎓" tint={{ bg: 'rgba(122,90,248,0.14)', fg: '#7A5AF8' }}
                label="Profesores" value={d.staff.professors}
                sub={`${d.staff.assistants} asistentes`} subColor="var(--text-soft)" />
              <StatCard icon="✓" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
                label="Asistencia promedio" value={`${d.attendanceAvg}%`}
                sub="del semestre" subColor="var(--text-soft)" />
            </div>

            <div className="home-2col">
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3>Asistencia de la semana</h3>
                  <span className="text-xs text-gray">Lun – Sáb</span>
                </div>
                <LineChart values={d.weekly} />
              </div>
              <div className="card">
                <h3 className="mb-3">Distribución de asistencia</h3>
                <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
                  <Donut data={donutData} />
                  <div style={{ flex: 1, minWidth: 140 }}>
                    {donutData.map((s) => (
                      <div key={s.label} className="legend-row">
                        <span><span className="legend-dot" style={{ background: s.color }} />{s.label}</span>
                        <strong>{s.value}%</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="home-2col">
              <div className="card">
                <div className="flex items-center justify-between mb-2">
                  <h3>Clases de hoy</h3>
                  <button className="btn btn-ghost" style={{ minHeight: 30, fontSize: '0.8rem' }}
                    onClick={() => navigate('/')}>Ver todo</button>
                </div>
                {d.todayClasses.length === 0 ? (
                  <div className="alert alert-info" style={{ marginBottom: 0 }}>No hay clases programadas hoy.</div>
                ) : d.todayClasses.map((c) => (
                  <div key={c.groupId} className="home-list-row">
                    <span className="text-sm text-gray" style={{ width: 46 }}>{c.startTime}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="font-medium">
                        {c.code}{' '}
                        {c.ballLevel && (
                          <span className="legend-dot" style={{ background: BALL_COLOR[c.ballLevel] || 'var(--gray-400)' }} />
                        )}
                        <span className="text-sm text-gray"> {c.ballLevel || ''}</span>
                      </div>
                      <div className="text-xs text-gray">{c.professor}{c.court ? ` · Cancha ${c.court}` : ''}</div>
                    </div>
                    <span className="text-sm text-gray">{c.present}/{c.total}</span>
                    <span className={`badge ${STATUS_BADGE[c.status] || 'badge-gray'}`}>{c.status}</span>
                  </div>
                ))}
              </div>

              <div className="home-side">
                <div className="card">
                  <h3 className="mb-3">Carga por profesor</h3>
                  {d.professorLoad.length === 0 ? (
                    <div className="text-sm text-gray">Sin datos.</div>
                  ) : d.professorLoad.map((p, i) => (
                    <div key={p.name} style={{ marginBottom: 12 }}>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                          {initials(p.name)}
                        </span>
                        <span className="font-medium text-sm" style={{ flex: 1 }}>{p.name}</span>
                        <span className="text-xs text-gray">{p.groups} grupos</span>
                      </div>
                      <div className="load-bar">
                        <span style={{ width: `${(p.groups / maxLoad) * 100}%`, background: AVATAR_COLORS[i % AVATAR_COLORS.length] }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3>Revisiones pendientes</h3>
                    <button className="btn btn-ghost" style={{ minHeight: 30, fontSize: '0.8rem' }}
                      onClick={() => navigate('/admin/validation')}>Ver todo</button>
                  </div>
                  {d.pendingReviews.length === 0 ? (
                    <div className="text-sm text-gray">✅ Nada por revisar.</div>
                  ) : d.pendingReviews.map((r, i) => (
                    <div key={i} className="home-list-row">
                      <span className="legend-dot" style={{ background: 'var(--warning)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-medium text-sm">{r.code} · {r.professor}</div>
                        <div className="text-xs text-gray">{r.note}</div>
                      </div>
                      <span className="badge badge-yellow">Pendiente</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
