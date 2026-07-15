import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../utils/offlineCache';
import { toast } from '../../utils/toast';

const STATUS_LABELS = { PRESENTE: 'P', AUSENTE: 'A', JUSTIFICADA: 'J' };
const STATUS_CLASS = { PRESENTE: 'present', AUSENTE: 'absent', JUSTIFICADA: 'justified' };

export default function Step3Students({ groupId, records, onChange, onNext }) {
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  // Per-student "classes seen / acquired" for the active semester, keyed by id.
  const [meta, setMeta] = useState({});
  const [showRepoSearch, setShowRepoSearch] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [justifStudent, setJustifStudent] = useState(null);
  const [justifText, setJustifText] = useState('');
  // Clase de prueba: prospecto nuevo, solo con nombre (se crea al confirmar).
  const [trialMode, setTrialMode] = useState(false);
  const [trialName, setTrialName] = useState('');
  const [trialSaving, setTrialSaving] = useState(false);

  useEffect(() => {
    // Aplica el roster (de red o de caché) al estado de la pantalla.
    function apply(group, all) {
      setStudents(group);
      setAllStudents(all);
      setMeta(Object.fromEntries(
        group.map((s) => [s.id, { seen: s.classesSeen ?? 0, acquired: s.classesAcquired ?? 0 }])
      ));
      // Pre-populate records for group students
      if (records.length === 0) {
        onChange(group.map((s) => ({ studentId: s.id, name: s.name, status: null, attendanceType: 'REGULAR' })));
      }
    }

    Promise.all([
      api.get(`/groups/${groupId}/students`),
      api.get('/students', { active: 'true', excludeSuspended: 'true' }),
    ]).then(([group, all]) => {
      // Guarda el roster para poder tomar asistencia sin conexión.
      cacheSet(CACHE_KEYS.roster(groupId), group);
      cacheSet(CACHE_KEYS.allStudents, all);
      apply(group, all);
    }).catch(() => {
      // Sin conexión: usar el último roster guardado de este grupo.
      const group = cacheGet(CACHE_KEYS.roster(groupId), []);
      const all = cacheGet(CACHE_KEYS.allStudents, []);
      if (group.length) apply(group, all);
    }).finally(() => setLoading(false));
  }, [groupId]);

  function setStatus(studentId, status) {
    onChange(records.map((r) =>
      r.studentId === studentId ? { ...r, status, justification: status !== 'JUSTIFICADA' ? null : r.justification } : r
    ));
    if (status === 'JUSTIFICADA') {
      const student = students.find((s) => s.id === studentId) ||
        records.find((r) => r.studentId === studentId);
      setJustifStudent({ id: studentId, name: student?.name });
    }
  }

  function saveJustification() {
    onChange(records.map((r) =>
      r.studentId === justifStudent.id ? { ...r, justification: justifText } : r
    ));
    setJustifStudent(null);
    setJustifText('');
  }

  function addReposition(student) {
    const already = records.find((r) => r.studentId === student.id);
    if (!already) {
      onChange([...records, { studentId: student.id, name: student.name, status: null, attendanceType: 'REPOSICION' }]);
    }
    setShowRepoSearch(false);
    setSearch('');
  }

  // Crea el estudiante de clase de prueba (isTrial) y lo agrega a la lista.
  async function addTrialStudent() {
    const name = trialName.trim();
    if (!name) return;
    setTrialSaving(true);
    try {
      const s = await api.post('/students/trial', { name });
      onChange([...records, { studentId: s.id, name: s.name, status: null, attendanceType: 'REPOSICION', isTrial: true }]);
      setShowRepoSearch(false);
      setTrialMode(false);
      setTrialName('');
      setSearch('');
    } catch (err) {
      toast.error(err.message || 'No se pudo crear la clase de prueba (¿sin conexión?)');
    } finally {
      setTrialSaving(false);
    }
  }

  const allMarked = records.length > 0 && records.every((r) => r.status !== null);
  const present = records.filter((r) => r.status === 'PRESENTE').length;
  const absent = records.filter((r) => r.status === 'AUSENTE').length;
  const justified = records.filter((r) => r.status === 'JUSTIFICADA').length;

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <h2 className="mb-2">Lista de estudiantes</h2>

      <div className="stats-row mb-3">
        <div className="stat-box stat-present"><div className="num">{present}</div><div className="lbl">Presentes</div></div>
        <div className="stat-box stat-absent"><div className="num">{absent}</div><div className="lbl">Ausentes</div></div>
        <div className="stat-box stat-justified"><div className="num">{justified}</div><div className="lbl">Justificadas</div></div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 mb-3">
        <button className="btn btn-outline" style={{ flex: 1, minHeight: 40, fontSize: '0.875rem' }}
          onClick={() => onChange(records.map((r) => ({ ...r, status: 'PRESENTE' })))}>
          Todos P
        </button>
        <button className="btn btn-outline" style={{ flex: 1, minHeight: 40, fontSize: '0.875rem' }}
          onClick={() => onChange(records.map((r) => ({ ...r, status: 'AUSENTE' })))}>
          Todos A
        </button>
      </div>

      {records.map((r) => (
        <div key={r.studentId} className="student-row">
          <div className="student-name">
            {r.name}
            {r.isTrial ? (
              <span className="badge badge-yellow" style={{ marginLeft: 6, fontSize: '0.7rem' }}>🧪 prueba</span>
            ) : r.attendanceType === 'REPOSICION' && (
              <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: '0.7rem' }}>repo</span>
            )}
            {meta[r.studentId] && (
              <div className="text-xs text-gray" style={{ fontWeight: 400, marginTop: 2 }}>
                Clases: {meta[r.studentId].seen}/{meta[r.studentId].acquired}
              </div>
            )}
          </div>
          <div className="student-actions">
            {(['PRESENTE', 'AUSENTE', 'JUSTIFICADA']).map((s) => (
              <button
                key={s}
                className={`att-btn ${r.status === s ? `selected ${STATUS_CLASS[s]}` : r.status ? 'dim' : ''}`}
                aria-pressed={r.status === s}
                onClick={() => setStatus(r.studentId, s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Reposition */}
      {!showRepoSearch ? (
        <button className="btn btn-ghost btn-full mt-3" onClick={() => setShowRepoSearch(true)}>
          + Agregar estudiante de reposición
        </button>
      ) : trialMode ? (
        <div className="card mt-3" style={{ borderLeft: '4px solid var(--yellow)' }}>
          <h3 className="mb-1">🧪 Clase de prueba</h3>
          <p className="text-xs text-gray mb-2">
            Estudiante nuevo que viene a probar. Escribe su nombre; quedará marcado
            como «Clase de prueba» para que la Escuela le haga seguimiento.
          </p>
          <input
            type="text"
            className="form-input mb-2"
            placeholder="Nombre del estudiante..."
            value={trialName}
            maxLength={200}
            onChange={(e) => setTrialName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button className="btn btn-outline" style={{ flex: 1 }}
              onClick={() => { setTrialMode(false); setTrialName(''); }}>
              ← Volver
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }}
              onClick={addTrialStudent} disabled={trialSaving || !trialName.trim()}>
              {trialSaving ? 'Agregando…' : 'Agregar a la lista'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card mt-3">
          <h3 className="mb-2">Buscar estudiante</h3>
          <button className="btn btn-outline btn-full mb-2"
            style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)' }}
            onClick={() => setTrialMode(true)}>
            🧪 Clase de prueba (estudiante nuevo)
          </button>
          <input
            type="text"
            className="form-input mb-2"
            placeholder="Nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {allStudents
            .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) && !records.find((r) => r.studentId === s.id))
            .slice(0, 8)
            .map((s) => (
              <button key={s.id} className="btn btn-outline btn-full mb-1" onClick={() => addReposition(s)}>
                {s.name}{s.isTrial ? ' 🧪' : ''}
              </button>
            ))}
          <button className="btn btn-ghost btn-full mt-1" onClick={() => setShowRepoSearch(false)}>
            Cancelar
          </button>
        </div>
      )}

      {/* Justification modal */}
      {justifStudent && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end', zIndex: 100,
        }}>
          <div className="card" style={{ width: '100%', borderRadius: '16px 16px 0 0', padding: 20 }}>
            <h3 className="mb-2">Justificación — {justifStudent.name}</h3>
            <textarea
              className="form-input"
              style={{ minHeight: 80, resize: 'none' }}
              placeholder="Descripción opcional (médica, personal...)"
              value={justifText}
              onChange={(e) => setJustifText(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setJustifStudent(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={saveJustification}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="action-bar">
        <button
          className="btn btn-primary btn-full btn-lg"
          onClick={onNext}
          disabled={!allMarked}
        >
          Ver resumen →
        </button>
      </div>
      <div style={{ height: 72 }} />
    </div>
  );
}
