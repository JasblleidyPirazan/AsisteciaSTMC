import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { fmtDate } from '../utils/dates';

const ROLE_LABELS = {
  ADMIN: 'Admin',
  TEACHER: 'Profesor',
  PHYSICAL_TRAINER: 'Preparador Físico',
};

const STATUS_BADGE = {
  PRESENTE: 'badge-green',
  AUSENTE: 'badge-red',
  JUSTIFICADA: 'badge-yellow',
};

const STATUS_LABEL = { PRESENTE: 'P', AUSENTE: 'A', JUSTIFICADA: 'J' };

export default function ConflictResolutionPage({ type = 'session' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const apiBase = type === 'makeup' ? `/makeups/${id}` : `/sessions/${id}`;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [customRecords, setCustomRecords] = useState([]);

  useEffect(() => {
    api.get(`${apiBase}/conflict`)
      .then((d) => {
        setData(d);
        // Initialize custom records from canonical (current state)
        const canon = d.conflict.canonicalRecords || [];
        setCustomRecords(canon.map((r) => ({ ...r })));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [apiBase]);

  async function resolve(accept, records) {
    setResolving(true);
    setError('');
    try {
      const body = accept === 'custom' ? { accept, records } : { accept };
      await api.post(`${apiBase}/resolve`, body);
      navigate(-1);
    } catch (err) {
      setError(err.message);
    } finally {
      setResolving(false);
    }
  }

  function setStudentStatus(studentId, status) {
    setCustomRecords((prev) =>
      prev.map((r) => r.studentId === studentId ? { ...r, status } : r)
    );
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  if (error && !data) {
    return (
      <div className="page">
        <div className="page-header">
          <button className="nav-back" onClick={() => navigate(-1)}>←</button>
          <h2>Conflicto</h2>
        </div>
        <div className="page-content">
          <div className="alert alert-error">{error}</div>
        </div>
      </div>
    );
  }

  const { session, conflict } = data;
  const diff = conflict.diffSummary || [];
  const conflictCount = diff.filter((d) => d.conflict).length;

  const canonicalRole = ROLE_LABELS[conflict.canonicalBy?.role] || conflict.canonicalBy?.role || 'Desconocido';
  const challengerRole = ROLE_LABELS[conflict.challengerBy?.role] || conflict.challengerBy?.role || 'Desconocido';

  const groupInfo = session.group
    ? `${session.group.code}${session.group.name ? ' · ' + session.group.name : ''}`
    : session.title || 'Reposición';

  const isAdmin = user?.role === 'ADMIN';

  // All students from both sides (union)
  const allStudentsForEdit = (() => {
    const map = new Map();
    (conflict.canonicalRecords || []).forEach((r) => map.set(r.studentId, r));
    (conflict.challengerRecords || []).forEach((r) => { if (!map.has(r.studentId)) map.set(r.studentId, r); });
    return Array.from(map.values());
  })();

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate(-1)}>←</button>
        <div style={{ flex: 1 }}>
          <h2>Conflicto de reporte</h2>
          <p className="text-xs text-gray">{groupInfo} · {fmtDate(session.date)}</p>
        </div>
        <span className="badge badge-red">EN REVISIÓN</span>
      </div>

      <div className="page-content">
        {error && <div className="alert alert-error">{error}</div>}

        {/* Context */}
        <div className="card mb-3" style={{ borderLeft: '3px solid var(--red)' }}>
          <div className="text-sm" style={{ marginBottom: 6 }}>
            <strong>{conflictCount}</strong> diferencia{conflictCount !== 1 ? 's' : ''} detectada{conflictCount !== 1 ? 's' : ''} entre dos reportes de la misma clase.
          </div>
          <div className="text-xs text-gray">
            Primer reporte: <strong>{canonicalRole}</strong> ({conflict.canonicalBy?.email})
          </div>
          <div className="text-xs text-gray">
            Segundo reporte: <strong>{challengerRole}</strong> ({conflict.challengerBy?.email})
          </div>
        </div>

        {/* Comparison table */}
        {!editMode && (
          <div className="card mb-3" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '1.5px solid var(--gray-200)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Estudiante</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600 }}>{canonicalRole}</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600 }}>{challengerRole}</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map((d, i) => (
                    <tr
                      key={d.studentId}
                      style={{
                        borderBottom: i < diff.length - 1 ? '1px solid var(--gray-100)' : 'none',
                        background: d.conflict ? 'var(--orange-light)' : '#fff',
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>{d.name}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        {d.canonical
                          ? <span className={`badge ${STATUS_BADGE[d.canonical]}`}>{d.canonical}</span>
                          : <span className="badge badge-gray">—</span>}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        {d.challenger
                          ? <span className={`badge ${STATUS_BADGE[d.challenger]}`}>{d.challenger}</span>
                          : <span className="badge badge-gray">—</span>}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '1rem' }}>
                        {d.conflict ? '⚠️' : '✓'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Custom edit mode */}
        {editMode && (
          <div className="card mb-3">
            <h3 className="mb-3">Editar reporte</h3>
            <p className="text-xs text-gray mb-3">Ajusta el estado de cada estudiante y envía para resolver.</p>
            {customRecords.map((r) => (
              <div key={r.studentId} className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                <span className="text-sm font-medium">{r.name}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['PRESENTE', 'AUSENTE', 'JUSTIFICADA'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setStudentStatus(r.studentId, s)}
                      style={{
                        minWidth: 44,
                        minHeight: 36,
                        borderRadius: 8,
                        border: '2px solid',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        transition: 'all 0.12s',
                        borderColor: r.status === s
                          ? (s === 'PRESENTE' ? 'var(--green)' : s === 'AUSENTE' ? 'var(--red)' : 'var(--yellow)')
                          : 'var(--gray-200)',
                        background: r.status === s
                          ? (s === 'PRESENTE' ? 'var(--green)' : s === 'AUSENTE' ? 'var(--red)' : 'var(--yellow)')
                          : '#fff',
                        color: r.status === s ? '#fff' : 'var(--gray-600)',
                      }}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditMode(false)} disabled={resolving}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => resolve('custom', customRecords)}
                disabled={resolving}
              >
                {resolving ? 'Guardando...' : 'Enviar resolución'}
              </button>
            </div>
          </div>
        )}

        {/* Resolution actions */}
        {!editMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <div className="text-sm font-medium" style={{ color: 'var(--gray-600)', marginBottom: 4 }}>
              ¿Cuál reporte es correcto?
            </div>

            <button
              className="btn btn-outline btn-full"
              onClick={() => resolve('canonical')}
              disabled={resolving}
            >
              {resolving ? '...' : `Aceptar reporte de ${canonicalRole}`}
              <span className="text-xs text-gray" style={{ display: 'block', fontWeight: 400 }}>
                (primer reporte — estado actual)
              </span>
            </button>

            <button
              className="btn btn-success btn-full"
              onClick={() => resolve('challenger')}
              disabled={resolving}
            >
              {resolving ? '...' : `Aceptar reporte de ${challengerRole}`}
              <span className="text-xs text-gray" style={{ display: 'block', fontWeight: 400, color: '#fff', opacity: 0.85 }}>
                (segundo reporte — el que generó la diferencia)
              </span>
            </button>

            <button
              className="btn btn-outline btn-full"
              onClick={() => {
                setCustomRecords(allStudentsForEdit.map((r) => ({ ...r })));
                setEditMode(true);
              }}
              disabled={resolving}
            >
              Editar manualmente
            </button>
          </div>
        )}

        {!editMode && isAdmin && (
          <div className="text-xs text-gray" style={{ textAlign: 'center' }}>
            Como admin, puedes resolver este conflicto seleccionando cualquier opción.
          </div>
        )}
      </div>
    </div>
  );
}
