import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate } from '../../utils/dates';

const STATUS_LABEL = { REALIZADA: 'Realizada', CANCELADA: 'Cancelada', CANCELADA_MITAD: 'Media', PROGRAMADA: 'Programada' };

export default function AsistenciaPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [sessions, setSessions] = useState(null);

  useEffect(() => { api.get('/groups', { active: 'true' }).then(setGroups).catch(() => {}); }, []);

  useEffect(() => {
    if (!groupId) { setSessions(null); return; }
    setSessions(null);
    api.get(`/reports/group/${groupId}`).then(setSessions).catch(() => setSessions([]));
  }, [groupId]);

  return (
    <div className="page page-wide">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Asistencia</h1>
      </div>
      <div className="page-content">
        <p className="text-sm text-gray mb-3">Historial de asistencia por grupo (solo lectura).</p>
        <div className="form-group mb-3">
          <label className="form-label">Grupo</label>
          <select className="form-input form-select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Selecciona un grupo</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
          </select>
        </div>

        {!groupId ? null : sessions === null ? <div className="spinner" /> : sessions.length === 0 ? (
          <div className="alert alert-info">Sin clases registradas para este grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Fecha</th><th>Estado</th><th className="num">Presentes</th><th className="num">Ausentes</th><th className="num">Justif.</th><th className="num">%</th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDate(s.date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td>{STATUS_LABEL[s.status] || s.status}</td>
                    <td className="num" style={{ color: 'var(--green)' }}>{s.present}</td>
                    <td className="num" style={{ color: 'var(--red)' }}>{s.absent}</td>
                    <td className="num" style={{ color: 'var(--yellow)' }}>{s.justified}</td>
                    <td className="num font-medium">{s.attendanceRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
