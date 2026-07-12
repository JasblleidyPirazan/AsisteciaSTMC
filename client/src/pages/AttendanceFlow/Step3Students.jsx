import { useState, useEffect } from 'react';
import { api } from '../../api/client';

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
  const [error, setError] = useState('');
  const [justifStudent, setJustifStudent] = useState(null);
  const [justifText, setJustifText] = useState('');

  function loadRoster() {
    setLoading(true);
    setError('');
    // El roster del grupo y el listado global se cargan por separado, así una
    // falla en uno no deja la lista en blanco sin explicación.
    api.get(`/groups/${groupId}/students`)
      .then((roster) => {
        setStudents(roster);
        setMeta(Object.fromEntries(
          roster.map((s) => [s.id, { seen: s.classesSeen ?? 0, acquired: s.classesAcquired ?? 0 }])
        ));
        // Pre-cargar los estudiantes del grupo (principal o secundario)
        if (records.length === 0) {
          onChange(roster.map((s) => ({ studentId: s.id, name: s.name, status: null, attendanceType: 'REGULAR' })));
        }
      })
      .catch((err) => setError(err.message || 'No se pudo cargar la lista del grupo'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRoster();
    api.get('/students', { active: 'true', excludeSuspended: 'true' })
      .then(setAllStudents).catch(() => {});
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
    // Mantener el buscador abierto para agregar tantos estudiantes como se quiera.
    setSearch('');
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

      {/* Quick actions: solo "Todos Presentes". Marcar todos ausentes no aplica
          — eso sería una clase no dictada (se maneja en "¿Se realizó?"). */}
      {records.length > 0 && (
        <div className="flex gap-2 mb-3">
          <button className="btn btn-outline" style={{ flex: 1, minHeight: 40, fontSize: '0.875rem' }}
            onClick={() => onChange(records.map((r) => ({ ...r, status: 'PRESENTE' })))}>
            Todos Presentes
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error mb-3">
          {error}
          <button className="btn btn-ghost btn-full mt-2" onClick={loadRoster}>Reintentar</button>
        </div>
      )}
      {!error && !loading && records.length === 0 && (
        <div className="alert alert-info mb-3">
          Este grupo no tiene estudiantes vinculados. Agrega estudiantes al grupo en
          la sección Estudiantes, o usa "Agregar estudiante de reposición".
        </div>
      )}

      {records.map((r) => (
        <div key={r.studentId} className="student-row">
          <div className="student-name">
            {r.name}
            {r.attendanceType === 'REPOSICION' && (
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
      ) : (
        <div className="card mt-3">
          <h3 className="mb-2">Buscar estudiante</h3>
          <input
            type="text"
            className="form-input mb-2"
            placeholder="Nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {allStudents
              .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) && !records.find((r) => r.studentId === s.id))
              .slice(0, 50)
              .map((s) => (
                <button key={s.id} className="btn btn-outline btn-full mb-1" onClick={() => addReposition(s)}>
                  + {s.name}
                </button>
              ))}
          </div>
          <button className="btn btn-ghost btn-full mt-1" onClick={() => { setShowRepoSearch(false); setSearch(''); }}>
            Listo
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
