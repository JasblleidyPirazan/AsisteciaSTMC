import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { fmtDate } from '../../utils/dates';

const STATUS_LABEL = { PRESENTE: 'P', AUSENTE: 'A', JUSTIFICADA: 'J', null: '—' };

// Read-only for ADMIN; TEACHER/coordinador can jump to re-report their side.
export default function ConflictsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);

  const canReport = ['TEACHER', 'PHYSICAL_TRAINER', 'SUPERADMIN'].includes(user?.role);

  useEffect(() => {
    api.get('/alerts/report-conflicts')
      .then((d) => setConflicts(d.conflicts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Validación profesores</h1>
      </div>

      <div className="page-content">
        <p className="text-sm text-gray mb-3">
          Clases donde el reporte del <strong>profesor</strong> y el del <strong>coordinador</strong> no
          coinciden. Ambos deben ajustar su reporte hasta que coincidan; hasta entonces la clase no se
          consolida ni se habilita el pago.
        </p>

        {conflicts.length === 0 ? (
          <div className="alert alert-info">No hay conflictos de reporte. 🎉</div>
        ) : (
          conflicts.map((c) => (
            <div key={c.sessionId} className="card mb-3" style={{ borderLeft: '3px solid var(--red)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">
                  {c.group?.code}{c.group?.name ? ` · ${c.group.name}` : ''}
                </div>
                <span className="text-xs text-gray">{fmtDate(c.date)}</span>
              </div>

              <DiffTable diff={c.diff} />

              {canReport && (
                <button
                  className="btn btn-outline btn-full mt-3"
                  onClick={() => navigate(`/attendance/${c.groupId}`, {
                    state: { group: { id: c.groupId, code: c.group?.code, name: c.group?.name }, date: c.date.slice(0, 10) },
                  })}
                >
                  Ajustar mi reporte
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DiffTable({ diff }) {
  if (!diff) return null;
  const divergent = (diff.students || []).filter((s) => !s.match);
  return (
    <div className="text-sm">
      {!diff.dictating?.match && (
        <div className="mb-1">⚠️ <strong>Quién dictó</strong> no coincide.</div>
      )}
      {!diff.assistant?.match && (
        <div className="mb-1">⚠️ <strong>Asistente</strong> no coincide.</div>
      )}
      {divergent.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--gray-600)' }}>
                <th style={{ padding: '2px 6px' }}>Estudiante</th>
                <th style={{ padding: '2px 6px' }}>Profesor</th>
                <th style={{ padding: '2px 6px' }}>Coordinador</th>
              </tr>
            </thead>
            <tbody>
              {divergent.map((s) => (
                <tr key={s.studentId} style={{ borderTop: '1px solid var(--gray-200)' }}>
                  <td style={{ padding: '2px 6px' }}>{s.name || s.studentId}</td>
                  <td style={{ padding: '2px 6px' }}>{STATUS_LABEL[s.professor ?? 'null']}</td>
                  <td style={{ padding: '2px 6px' }}>{STATUS_LABEL[s.coordinator ?? 'null']}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
