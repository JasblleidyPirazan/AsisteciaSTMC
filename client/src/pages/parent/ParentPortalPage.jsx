import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

const STATUS_LABELS = { PRESENTE: 'Presente', AUSENTE: 'Ausente', JUSTIFICADA: 'Justificada' };
const STATUS_BADGE = { PRESENTE: 'badge-green', AUSENTE: 'badge-red', JUSTIFICADA: 'badge-yellow' };

export default function ParentPortalPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [selected, setSelected] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/parent/children').then((data) => {
      setChildren(data);
      if (data.length === 1) loadAttendance(data[0]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function loadAttendance(student) {
    setSelected(student);
    setAttendance(null);
    const data = await api.get(`/parent/attendance/${student.id}`);
    setAttendance(data);
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ flex: 1 }}>
          <h1>Portal de Padres</h1>
          <p className="text-xs text-gray">{user?.email}</p>
        </div>
        <button className="btn btn-ghost" style={{ minHeight: 36 }} onClick={logout}>
          Salir
        </button>
      </div>

      <div className="page-content">
        {children.length > 1 && (
          <div className="form-group mb-4">
            <label className="form-label">Estudiante</label>
            <select className="form-input form-select"
              value={selected?.id || ''}
              onChange={(e) => loadAttendance(children.find((c) => c.id === e.target.value))}>
              <option value="">Seleccionar...</option>
              {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {selected && attendance && (
          <>
            <div className="card mb-3">
              <h2 className="mb-1">{selected.name}</h2>
              {selected.enrollments?.map((e) => (
                <div key={e.groupId} className="text-sm text-gray">
                  {e.group.code} · {e.group.professor?.name}
                </div>
              ))}
            </div>

            <div className="stats-row mb-4">
              <div className="stat-box stat-present">
                <div className="num">{attendance.summary.present}</div>
                <div className="lbl">Presentes</div>
              </div>
              <div className="stat-box stat-absent">
                <div className="num">{attendance.summary.absent}</div>
                <div className="lbl">Ausentes</div>
              </div>
              <div className="stat-box">
                <div className="num" style={{ color: 'var(--blue)' }}>{attendance.summary.attendanceRate}%</div>
                <div className="lbl">Asistencia</div>
              </div>
            </div>

            <h3 className="mb-2">Historial</h3>
            {attendance.records.length === 0 ? (
              <div className="alert alert-info">Aún no hay registros de asistencia.</div>
            ) : (
              attendance.records.map((r) => (
                <div key={r.id} className="card mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {new Date(r.session.date + 'T12:00:00').toLocaleDateString('es-CO', {
                          weekday: 'short', month: 'short', day: 'numeric'
                        })}
                      </div>
                      <div className="text-xs text-gray">{r.session.group.code}</div>
                    </div>
                    <span className={`badge ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  {r.justification && (
                    <p className="text-xs text-gray mt-1">📝 {r.justification}</p>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {children.length === 0 && (
          <div className="alert alert-info">
            No tienes estudiantes vinculados. Contacta al administrador.
          </div>
        )}
      </div>
    </div>
  );
}
