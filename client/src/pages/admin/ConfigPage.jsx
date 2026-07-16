import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../../utils/toast';

const EMPTY_CONFIG = {
  rate_2_students: '',
  rate_3_students: '',
  rate_4_students: '',
  rate_5plus_students: '',
  assistant_fixed_rate: '',
  rain_alert_threshold: '',
  tuition_adult_total: '',
  tuition_child_total: '',
  tuition_plan_classes: '',
  tuition_adult_age: '',
};

const EMPTY_SEMESTER = { name: '', startDate: '', endDate: '' };

function fmt(n) {
  return Number(n || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

export default function ConfigPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'SUPERADMIN';
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Zona de peligro: reinicio de datos de clases (solo Superadmin)
  const [wipeText, setWipeText] = useState('');
  const [wiping, setWiping] = useState(false);

  async function handleWipeClasses() {
    if (wipeText !== 'BORRAR CLASES') return;
    if (!confirm('¿Seguro? Se borrarán TODAS las sesiones, asistencia, reposiciones, festivales y costos. Esto NO se puede deshacer.')) return;
    setWiping(true);
    try {
      const r = await api.post('/system/wipe-classes', { confirm: 'BORRAR CLASES' });
      toast.success(`Listo. Se borraron ${r.total} registros de clases. Estudiantes, grupos y config quedaron intactos.`);
      setWipeText('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setWiping(false);
    }
  }

  // Semesters
  const [semesters, setSemesters] = useState([]);
  const [semForm, setSemForm] = useState(EMPTY_SEMESTER);
  const [showSemForm, setShowSemForm] = useState(false);
  const [semSaving, setSemSaving] = useState(false);
  const [semError, setSemError] = useState('');

  // Exclusions
  const [expandedSem, setExpandedSem] = useState(null);
  const [exclDate, setExclDate] = useState('');
  const [exclReason, setExclReason] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/config'),
      api.get('/semesters'),
    ]).then(([cfg, sems]) => {
      setConfig({ ...EMPTY_CONFIG, ...cfg });
      setSemesters(sems);
    }).finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/config', config);
      setSaved(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSemester(e) {
    e.preventDefault();
    setSemSaving(true);
    setSemError('');
    try {
      const sem = await api.post('/semesters', semForm);
      setSemesters([sem, ...semesters]);
      setShowSemForm(false);
      setSemForm(EMPTY_SEMESTER);
    } catch (err) {
      setSemError(err.message);
    } finally {
      setSemSaving(false);
    }
  }

  async function handleActivateSemester(id) {
    try {
      const updated = await api.put(`/semesters/${id}`, { active: true });
      setSemesters(semesters.map((s) => ({ ...s, active: s.id === id })));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDeleteSemester(id) {
    if (!confirm('¿Eliminar este semestre y sus fechas excluidas?')) return;
    try {
      await api.delete(`/semesters/${id}`);
      setSemesters(semesters.filter((s) => s.id !== id));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleAddExclusion(semId) {
    if (!exclDate) return;
    try {
      const excl = await api.post(`/semesters/${semId}/exclusions`, { date: exclDate, reason: exclReason || undefined });
      setSemesters(semesters.map((s) =>
        s.id === semId ? { ...s, exclusions: [...(s.exclusions || []), excl] } : s
      ));
      setExclDate('');
      setExclReason('');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDeleteExclusion(semId, exclId) {
    try {
      await api.delete(`/semesters/${semId}/exclusions/${exclId}`);
      setSemesters(semesters.map((s) =>
        s.id === semId ? { ...s, exclusions: s.exclusions.filter((e) => e.id !== exclId) } : s
      ));
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Configuración</h1>
      </div>

      <div className="page-content">

        {/* ── Tarifas ──────────────────────────────────────────── */}
        <h2 className="mb-3">Tarifas de pago</h2>
        <p className="text-sm text-gray mb-3">
          El pago al profesor se basa en el número de estudiantes presentes (tarifa plana por sesión × unidades).
        </p>
        {saved && <div className="alert alert-success mb-3">Configuración actualizada.</div>}

        <form onSubmit={handleSave}>
          <div className="card mb-3">
            <h3 className="mb-3" style={{ fontSize: '0.9rem' }}>Tarifas por estudiantes presentes — Profesor</h3>
            {[
              { key: 'rate_2_students', label: '2 estudiantes (COP)', placeholder: '30000' },
              { key: 'rate_3_students', label: '3 estudiantes (COP)', placeholder: '45000' },
              { key: 'rate_4_students', label: '4 estudiantes (COP)', placeholder: '60000' },
              { key: 'rate_5plus_students', label: '5 o más estudiantes (COP)', placeholder: '75000' },
            ].map(({ key, label, placeholder }) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input
                  type="number"
                  className="form-input"
                  value={config[key]}
                  onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                  placeholder={placeholder}
                  min="0"
                />
              </div>
            ))}
            <div className="card mb-2" style={{ background: 'var(--blue-light)', marginTop: 8 }}>
              <div className="text-xs text-gray mb-1">Ejemplo · 3 estudiantes presentes:</div>
              <div className="text-sm font-medium">
                Profesor: {fmt(config.rate_3_students)} por la sesión
              </div>
            </div>
          </div>

          <div className="card mb-4">
            <h3 className="mb-3" style={{ fontSize: '0.9rem' }}>Asistente</h3>
            <div className="form-group">
              <label className="form-label">Tarifa fija — Asistente por clase (COP)</label>
              <input
                type="number"
                className="form-input"
                value={config.assistant_fixed_rate}
                onChange={(e) => setConfig({ ...config, assistant_fixed_rate: e.target.value })}
                placeholder="12000"
                min="0"
              />
              <span className="text-xs text-gray">Pago fijo al asistente × unidades de clase</span>
            </div>
          </div>

          <div className="card mb-4">
            <h3 className="mb-3" style={{ fontSize: '0.9rem' }}>Matrícula de estudiantes</h3>
            <p className="text-xs text-gray mb-3">
              Valor del plan por categoría de edad. El estado <strong>Matriculado</strong> (pago completo)
              se deriva comparando los pagos registrados contra el valor de las clases adquiridas:
              esperado = clases adquiridas × (valor del plan ÷ clases del plan).
            </p>
            <div className="form-group">
              <label className="form-label">Valor adulto — plan de {config.tuition_plan_classes || 40} clases (COP)</label>
              <input type="number" className="form-input" min="0" placeholder="2789000"
                value={config.tuition_adult_total}
                onChange={(e) => setConfig({ ...config, tuition_adult_total: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Valor pequeños — plan de {config.tuition_plan_classes || 40} clases (COP)</label>
              <input type="number" className="form-input" min="0" placeholder="2425000"
                value={config.tuition_child_total}
                onChange={(e) => setConfig({ ...config, tuition_child_total: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Clases del plan</label>
                <input type="number" className="form-input" min="1" placeholder="40"
                  value={config.tuition_plan_classes}
                  onChange={(e) => setConfig({ ...config, tuition_plan_classes: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Edad adulto (desde, años)</label>
                <input type="number" className="form-input" min="1" placeholder="18"
                  value={config.tuition_adult_age}
                  onChange={(e) => setConfig({ ...config, tuition_adult_age: e.target.value })} />
              </div>
            </div>
            <span className="text-xs text-gray">
              La categoría se calcula con la fecha de nacimiento; los estudiantes sin fecha quedan marcados con error ⚠️.
            </span>
          </div>

          <div className="card mb-4">
            <h3 className="mb-3" style={{ fontSize: '0.9rem' }}>Alertas</h3>
            <div className="form-group">
              <label className="form-label">Umbral de alerta por lluvia (clases canceladas)</label>
              <input
                type="number"
                className="form-input"
                value={config.rain_alert_threshold}
                onChange={(e) => setConfig({ ...config, rain_alert_threshold: e.target.value })}
                placeholder="3"
                min="1"
              />
              <span className="text-xs text-gray">
                Un grupo entra en alerta cuando acumula este número de clases canceladas por lluvia en el semestre.
              </span>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar tarifas'}
          </button>
        </form>

        {/* ── Semestres ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 }}>
          <h2>Semestres</h2>
          <button className="btn btn-primary" style={{ minHeight: 34, padding: '0 12px', fontSize: '0.8rem' }}
            onClick={() => setShowSemForm(true)}>
            + Nuevo
          </button>
        </div>

        {showSemForm && (
          <div className="card mb-3">
            <h3 className="mb-3">Nuevo semestre</h3>
            {semError && <div className="alert alert-error mb-2">{semError}</div>}
            <form onSubmit={handleCreateSemester}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input type="text" className="form-input" required placeholder="Ej: Semestre 2026-1"
                  value={semForm.name} onChange={(e) => setSemForm({ ...semForm, name: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Inicio *</label>
                  <input type="date" className="form-input" required value={semForm.startDate}
                    onChange={(e) => setSemForm({ ...semForm, startDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fin *</label>
                  <input type="date" className="form-input" required value={semForm.endDate}
                    onChange={(e) => setSemForm({ ...semForm, endDate: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setShowSemForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={semSaving}>
                  {semSaving ? 'Guardando...' : 'Crear semestre'}
                </button>
              </div>
            </form>
          </div>
        )}

        {semesters.length === 0 && (
          <div className="alert alert-info">No hay semestres creados.</div>
        )}

        {semesters.map((sem) => (
          <div key={sem.id} className="card mb-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{sem.name}</span>
                  {sem.active && (
                    <span className="badge" style={{ background: 'var(--green)', color: '#fff', fontSize: '0.65rem' }}>
                      Activo
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray">
                  {fmtDate(sem.startDate)}{' — '}{fmtDate(sem.endDate)}
                </div>
                <div className="text-xs text-gray">{sem.exclusions?.length || 0} fechas excluidas</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {!sem.active && (
                  <button className="btn btn-ghost" style={{ minHeight: 28, padding: '0 8px', fontSize: '0.75rem' }}
                    onClick={() => handleActivateSemester(sem.id)}>
                    Activar
                  </button>
                )}
                <button className="btn btn-ghost" style={{ minHeight: 28, padding: '0 8px', fontSize: '0.75rem' }}
                  onClick={() => setExpandedSem(expandedSem === sem.id ? null : sem.id)}>
                  {expandedSem === sem.id ? '▲' : '▼'}
                </button>
                <button className="btn btn-ghost" style={{ minHeight: 28, padding: '0 6px', fontSize: '0.75rem', color: 'var(--red)' }}
                  onClick={() => handleDeleteSemester(sem.id)}>
                  ✕
                </button>
              </div>
            </div>

            {expandedSem === sem.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
                <div className="text-xs text-gray mb-2">Fechas excluidas (festivos, vacaciones, etc.)</div>

                {sem.exclusions?.map((excl) => (
                  <div key={excl.id} className="flex items-center justify-between mb-1">
                    <span className="text-sm">
                      {fmtDate(excl.date)}
                      {excl.reason && <span className="text-gray"> — {excl.reason}</span>}
                    </span>
                    <button className="btn btn-ghost" style={{ minHeight: 24, padding: '0 6px', fontSize: '0.7rem', color: 'var(--red)' }}
                      onClick={() => handleDeleteExclusion(sem.id, excl.id)}>✕</button>
                  </div>
                ))}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 8, alignItems: 'end' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Fecha</label>
                    <input type="date" className="form-input" style={{ fontSize: '0.8rem' }}
                      value={exclDate} onChange={(e) => setExclDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Motivo</label>
                    <input type="text" className="form-input" style={{ fontSize: '0.8rem' }}
                      placeholder="Ej: Festivo" value={exclReason} onChange={(e) => setExclReason(e.target.value)} />
                  </div>
                  <button className="btn btn-primary" style={{ minHeight: 38, padding: '0 10px', fontSize: '0.8rem' }}
                    disabled={!exclDate} onClick={() => handleAddExclusion(sem.id)}>
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Zona de peligro — reinicio de datos de clases (solo Superadmin) */}
        {isSuperadmin && (
          <div className="card mt-4" style={{ borderLeft: '4px solid var(--red)' }}>
            <h3 style={{ color: 'var(--red)' }}>⚠️ Zona de peligro</h3>
            <div className="text-sm font-medium mt-2">Reiniciar datos de clases</div>
            <div className="text-xs text-gray mb-2">
              Borra <strong>todas</strong> las sesiones, asistencia, reposiciones, festivales y costos, para
              el arranque limpio de semestre. <strong>Conserva</strong> estudiantes, grupos, usuarios y config.
              Es irreversible — haz backup antes.
            </div>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <input className="form-input" style={{ flex: 1, minWidth: 180 }}
                placeholder='Escribe "BORRAR CLASES"' value={wipeText}
                onChange={(e) => setWipeText(e.target.value)} />
              <button className="btn" style={{ background: 'var(--red)', color: '#fff' }}
                disabled={wiping || wipeText !== 'BORRAR CLASES'} onClick={handleWipeClasses}>
                {wiping ? 'Borrando…' : 'Reiniciar datos de clases'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
