import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_BADGE = {
  PROGRAMADA: { cls: 'badge-blue', label: 'Programada' },
  REALIZADA: { cls: 'badge-green', label: 'Realizada' },
  CANCELADA: { cls: 'badge-red', label: 'Cancelada' },
  CANCELADA_MITAD: { cls: 'badge-yellow', label: 'Cancelada a la mitad' },
};

const EMPTY_FORM = {
  date: todayStr(),
  title: '',
  professorId: '',
  assistantId: '',
  countsAsUnits: '1',
  studentIds: [],
};

export default function MakeupsPage() {
  const navigate = useNavigate();
  const [makeups, setMakeups] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [assistants, setAssistants] = useState([]);
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
      const [m, p, a, s] = await Promise.all([
        api.get('/makeups'),
        api.get('/professors', { active: 'true' }),
        api.get('/assistants', { active: 'true' }),
        api.get('/students', { active: 'true', excludeSuspended: 'true' }),
      ]);
      setMakeups(m);
      setProfessors(p);
      setAssistants(a);
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

  function toggleStudent(id) {
    setForm((f) => ({
      ...f,
      studentIds: f.studentIds.includes(id)
        ? f.studentIds.filter((x) => x !== id)
        : [...f.studentIds, id],
    }));
  }

  async function handleCreate() {
    setError('');
    if (!form.professorId) { setError('Selecciona un profesor'); return; }
    if (form.studentIds.length === 0) { setError('Asigna al menos un estudiante'); return; }
    if (!(parseFloat(form.countsAsUnits) > 0)) { setError('Define por cuántas asistencias cuenta'); return; }

    setSaving(true);
    try {
      await api.post('/makeups', {
        date: form.date,
        title: form.title || undefined,
        professorId: form.professorId,
        assistantId: form.assistantId || undefined,
        countsAsUnits: parseFloat(form.countsAsUnits),
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
    if (!confirm('¿Eliminar esta reposición? Se borrará su reporte y costos asociados.')) return;
    try {
      await api.delete(`/makeups/${id}`);
      setMakeups((m) => m.filter((x) => x.id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Reposiciones</h1>
      </div>

      <div className="page-content">
        {error && <div className="alert alert-error mb-3">{error}</div>}

        {!creating ? (
          <button className="btn btn-primary btn-full mb-4" onClick={() => setCreating(true)}>
            + Crear reposición grupal
          </button>
        ) : (
          <div className="card mb-4">
            <h3 className="mb-3">Nueva reposición grupal</h3>

            <div className="form-group">
              <label className="form-label">Fecha *</label>
              <input type="date" className="form-input" value={form.date}
                onChange={(e) => update('date', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Nombre / descripción</label>
              <input type="text" className="form-input" value={form.title} maxLength={200}
                placeholder="Ej: Festival sábado, reposición lluvia..."
                onChange={(e) => update('title', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Profesor *</label>
              <select className="form-input form-select" value={form.professorId}
                onChange={(e) => update('professorId', e.target.value)}>
                <option value="">Seleccionar profesor</option>
                {professors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Asistente (opcional)</label>
              <select className="form-input form-select" value={form.assistantId}
                onChange={(e) => update('assistantId', e.target.value)}>
                <option value="">Sin asistente</option>
                {assistants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">¿Por cuántas asistencias cuenta? *</label>
              <input type="number" className="form-input" value={form.countsAsUnits}
                min="0.5" step="0.5" max="10"
                onChange={(e) => update('countsAsUnits', e.target.value)} />
              <span className="text-xs text-gray">
                Cada estudiante presente recupera este número de clases. También define el pago al profesor (×{form.countsAsUnits || '?'}).
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Estudiantes asignados * ({form.studentIds.length})</label>
              {form.studentIds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {form.studentIds.map((id) => (
                    <span key={id} className="chip chip-active" onClick={() => toggleStudent(id)}
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
                        onClick={() => toggleStudent(s.id)}>
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
                {saving ? 'Creando...' : 'Crear reposición'}
              </button>
            </div>
          </div>
        )}

        <h2 className="mb-3">Reposiciones</h2>
        {makeups.length === 0 ? (
          <div className="alert alert-info">No hay reposiciones registradas.</div>
        ) : (
          makeups.map((m) => {
            const badge = STATUS_BADGE[m.status] || STATUS_BADGE.PROGRAMADA;
            const participantCount = m.makeupParticipants?.length || 0;
            const presentCount = (m.attendanceRecords || []).filter((r) => r.status === 'PRESENTE').length;
            return (
              <div key={m.id} className="card mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{m.title || 'Reposición grupal'}</span>
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="text-sm text-gray">📅 {fmtDate(m.date)}</div>
                <div className="text-sm text-gray">🏫 {m.makeupProfessor?.name || '—'}
                  {m.substituteProfessor && ` (sustituto: ${m.substituteProfessor.name})`}</div>
                {m.assistant && <div className="text-sm text-gray">🤝 {m.assistant.name}</div>}
                <div className="text-sm text-gray">
                  👥 {participantCount} estudiante{participantCount !== 1 ? 's' : ''}
                  {m.status === 'REALIZADA' && ` · ${presentCount} presentes`}
                </div>
                <div className="text-xs text-gray">Cuenta por {parseFloat(m.effectiveUnits)} asistencia(s)</div>

                <div className="flex gap-2 mt-3">
                  {m.status === 'PROGRAMADA' && (
                    <button className="btn btn-outline" style={{ flex: 1, color: 'var(--red)', minHeight: 38 }}
                      onClick={() => handleDelete(m.id)}>
                      Eliminar
                    </button>
                  )}
                  <button className="btn btn-primary" style={{ flex: 2, minHeight: 38 }}
                    onClick={() => navigate(`/makeups/${m.id}/attendance`)}>
                    {m.status === 'PROGRAMADA' ? 'Reportar asistencia' : 'Ver / editar reporte'}
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
