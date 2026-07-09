import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

const STATUS_BADGE = {
  PROGRAMADA: { cls: 'badge-blue', label: 'Programado' },
  REALIZADA: { cls: 'badge-green', label: 'Realizado' },
  CANCELADA: { cls: 'badge-red', label: 'Cancelado' },
};

const EMPTY_FORM = {
  date: todayStr(),
  title: '',
  ratePerProfessor: '',
  professorIds: [],
  studentIds: [],
};

export default function FestivalsPage() {
  const navigate = useNavigate();
  const [festivals, setFestivals] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [studentSearch, setStudentSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [f, p, s] = await Promise.all([
        api.get('/festivals'),
        api.get('/professors', { active: 'true' }),
        api.get('/students', { active: 'true', excludeSuspended: 'true' }),
      ]);
      setFestivals(f);
      setProfessors(p);
      setStudents(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleIn(field, id) {
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(id) ? f[field].filter((x) => x !== id) : [...f[field], id],
    }));
  }

  async function handleCreate() {
    setError('');
    if (form.professorIds.length === 0) { setError('Selecciona al menos un profesor participante'); return; }
    if (form.studentIds.length === 0) { setError('Inscribe al menos un estudiante'); return; }
    if (!(parseFloat(form.ratePerProfessor) > 0)) { setError('Define el pago por profesor'); return; }

    setSaving(true);
    try {
      await api.post('/festivals', {
        date: form.date,
        title: form.title || undefined,
        ratePerProfessor: parseFloat(form.ratePerProfessor),
        professorIds: form.professorIds,
        studentIds: form.studentIds,
      });
      setForm(EMPTY_FORM);
      setStudentSearch('');
      setCreating(false);
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este festival? Se borrará su reporte y costos asociados.')) return;
    try {
      await api.delete(`/festivals/${id}`);
      setFestivals((f) => f.filter((x) => x.id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Festivales</h1>
      </div>

      <div className="page-content">
        {error && <div className="alert alert-error mb-3">{error}</div>}

        {!creating ? (
          <button className="btn btn-primary btn-full mb-4" onClick={() => setCreating(true)}>
            + Crear festival
          </button>
        ) : (
          <div className="card mb-4">
            <h3 className="mb-3">Nuevo festival</h3>

            <div className="form-group">
              <label className="form-label">Fecha *</label>
              <input type="date" className="form-input" value={form.date}
                onChange={(e) => update('date', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input type="text" className="form-input" value={form.title} maxLength={200}
                placeholder="Ej: Festival de fin de mes"
                onChange={(e) => update('title', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Pago por profesor (COP) *</label>
              <input type="number" className="form-input" min="1" value={form.ratePerProfessor}
                placeholder="Ej: 168000"
                onChange={(e) => update('ratePerProfessor', e.target.value)} />
              <span className="text-xs text-gray">
                Pago igualitario: todos los profesores participantes reciben este mismo monto.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Profesores participantes * ({form.professorIds.length})</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {professors.map((p) => {
                  const selected = form.professorIds.includes(p.id);
                  return (
                    <span key={p.id} className={`chip ${selected ? 'chip-active' : ''}`}
                      style={{ cursor: 'pointer' }} onClick={() => toggleIn('professorIds', p.id)}>
                      {selected ? '✓ ' : ''}{p.name}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Estudiantes inscritos * ({form.studentIds.length})</label>
              {form.studentIds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {form.studentIds.map((id) => (
                    <span key={id} className="chip chip-active" onClick={() => toggleIn('studentIds', id)}
                      style={{ cursor: 'pointer' }}>
                      {studentMap[id]?.name} ✕
                    </span>
                  ))}
                </div>
              )}
              <input type="text" className="form-input mb-2" placeholder="Buscar estudiante..."
                value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {students
                  .filter((s) => s.name.toLowerCase().includes(studentSearch.toLowerCase()))
                  .slice(0, 30)
                  .map((s) => {
                    const selected = form.studentIds.includes(s.id);
                    return (
                      <button key={s.id} type="button"
                        className={`btn btn-full mb-1 ${selected ? 'btn-primary' : 'btn-outline'}`}
                        style={{ justifyContent: 'flex-start', minHeight: 40 }}
                        onClick={() => toggleIn('studentIds', s.id)}>
                        {selected ? '✓ ' : ''}{s.name}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button className="btn btn-outline" style={{ flex: 1 }}
                onClick={() => { setCreating(false); setForm(EMPTY_FORM); setError(''); }}>
                Cancelar
              </button>
              <button className="btn btn-success" style={{ flex: 2 }}
                onClick={handleCreate} disabled={saving}>
                {saving ? 'Creando...' : 'Crear festival'}
              </button>
            </div>
          </div>
        )}

        <h2 className="mb-3">Festivales</h2>
        {festivals.length === 0 ? (
          <div className="alert alert-info">No hay festivales registrados.</div>
        ) : (
          festivals.map((f) => {
            const badge = STATUS_BADGE[f.status] || STATUS_BADGE.PROGRAMADA;
            const participantCount = f.makeupParticipants?.length || 0;
            const counted = (f.attendanceRecords || []).filter((r) => r.status !== 'JUSTIFICADA').length;
            return (
              <div key={f.id} className="card mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">🏆 {f.title || 'Festival'}</span>
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="text-sm text-gray">📅 {fmtDate(f.date)}</div>
                <div className="text-sm text-gray">
                  🏫 {(f.festivalProfessors || []).map((fp) => fp.professor?.name).join(', ') || '—'}
                </div>
                <div className="text-sm text-gray">
                  👥 {participantCount} estudiante{participantCount !== 1 ? 's' : ''}
                  {f.status === 'REALIZADA' && ` · ${counted} cuentan como clase`}
                </div>
                <div className="text-xs text-gray">
                  Pago: {fmt(f.festivalRate)} × {(f.festivalProfessors || []).length} profesor(es)
                </div>

                <div className="flex gap-2 mt-3">
                  {f.status === 'PROGRAMADA' && (
                    <button className="btn btn-outline" style={{ flex: 1, color: 'var(--red)', minHeight: 38 }}
                      onClick={() => handleDelete(f.id)}>
                      Eliminar
                    </button>
                  )}
                  <button className="btn btn-primary" style={{ flex: 2, minHeight: 38 }}
                    onClick={() => navigate(`/festivals/${f.id}/attendance`)}>
                    {f.status === 'PROGRAMADA' ? 'Reportar asistencia' : 'Ver / editar reporte'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
