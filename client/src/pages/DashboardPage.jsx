import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import GroupCard from '../components/GroupCard';
import OfflineBanner from '../components/OfflineBanner';
import AssistantDayView from '../components/AssistantDayView';
import { fmtDate } from '../utils/dates';
import { roleLabel } from '../utils/roles';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  return fmtDate(d, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGroups();
  }, [date]);

  async function loadGroups() {
    setLoading(true);
    try {
      const params = date === todayStr() ? { today: 'true' } : {};
      const data = await api.get('/groups', params);
      // If custom date, filter by that day of week
      if (date !== todayStr()) {
        const dow = new Date(date + 'T12:00:00').getDay();
        const dayFields = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
        const dayField = dayFields[dow];
        setGroups(data.filter((g) => g[dayField]));
      } else {
        setGroups(data);
      }
    } catch {
      const cached = localStorage.getItem('stmc_groups');
      if (cached) setGroups(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  }

  function handleGroupClick(group) {
    navigate(`/attendance/${group.id}`, { state: { group, date } });
  }

  const isAdmin = user?.role === 'ADMIN';
  const isPhysicalTrainer = user?.role === 'PHYSICAL_TRAINER';
  const isAssistant = user?.role === 'ASSISTANT';

  return (
    <div className="page">
      <OfflineBanner />
      <div className="page-header">
        <div style={{ flex: 1 }}>
          <h1>🎾 STMC</h1>
          <p className="text-xs text-gray">{user?.email} · {roleLabel(user?.role)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(isAdmin || isPhysicalTrainer) && (
            <button className="btn btn-outline" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
              onClick={() => navigate('/admin')}>
              {isAdmin ? 'Admin' : 'Coordinación'}
            </button>
          )}
          {(user?.role === 'TEACHER' || isAssistant) && (
            <button className="btn btn-outline" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
              onClick={() => navigate('/my-payroll')}>
              💰 Mi quincena
            </button>
          )}
          <button className="btn btn-ghost" style={{ minHeight: 36 }} onClick={logout}>
            Salir
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="form-group mb-4">
          <label className="form-label">Fecha</label>
          <input
            type="date"
            className="form-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <span className="text-xs text-gray">{formatDate(date)}</span>
        </div>

        {isAssistant ? (
          <AssistantDayView groups={groups} loading={loading} date={date} />
        ) : (
          <>
            <PendingReportsAlert />
            <PendingMakeups />
            <div className="flex items-center justify-between mb-3">
              <h2>Grupos del día</h2>
              <span className="badge badge-blue">{groups.length}</span>
            </div>
            {loading ? (
              <div className="spinner" />
            ) : groups.length === 0 ? (
              <div className="alert alert-info">No hay grupos programados para este día.</div>
            ) : (
              <div className="card-grid">
                {groups.map((g) => (
                  <GroupCard key={g.id} group={g} onClick={() => handleGroupClick(g)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PendingReportsAlert() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!['TEACHER', 'ADMIN', 'PHYSICAL_TRAINER'].includes(user?.role)) return;
    api.get('/alerts/pending-reports').then(setData).catch(() => {});
  }, [user?.role]);

  if (!data || data.totalPending === 0) return null;

  const isTeacher = user?.role === 'TEACHER';
  return (
    <div className="alert alert-error mb-4" style={{ marginBottom: 16 }}>
      <div className="font-medium">
        ⚠️ {isTeacher ? 'Tienes' : 'Hay'} {data.totalPending} clase{data.totalPending !== 1 ? 's' : ''} sin reportar
      </div>
      <div className="text-sm mt-2">
        Una clase que no se reporta el mismo día en que fue dictada queda con el
        <strong> pago suspendido</strong>; solo el administrador puede desbloquearlo.
      </div>
      <div className="text-xs mt-2">
        {data.groups.map((g) => (
          <div key={g.groupId}>
            {g.code}{!isTeacher && g.professor ? ` (${g.professor.name})` : ''}: {g.pendingDates.slice(0, 4).join(', ')}
            {g.pendingDates.length > 4 ? ` y ${g.pendingDates.length - 4} más` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingMakeups() {
  const navigate = useNavigate();
  const [makeups, setMakeups] = useState([]);

  useEffect(() => {
    api.get('/makeups', { status: 'PROGRAMADA' })
      .then((data) => setMakeups(data || []))
      .catch(() => {});
  }, []);

  if (makeups.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2>Reposiciones pendientes</h2>
        <span className="badge badge-blue">{makeups.length}</span>
      </div>
      {makeups.map((m) => (
        <div key={m.id} className="card card-tap mb-2" style={{ borderLeft: '3px solid var(--blue)' }}
          onClick={() => navigate(`/makeups/${m.id}/attendance`)}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">🔁 {m.title || 'Reposición grupal'}</div>
              <div className="text-sm text-gray">
                {fmtDate(m.date)} · {m.makeupProfessor?.name || '—'} · {m.makeupParticipants?.length || 0} est.
              </div>
            </div>
            <span style={{ fontSize: '1.2rem' }}>›</span>
          </div>
        </div>
      ))}
    </div>
  );
}

