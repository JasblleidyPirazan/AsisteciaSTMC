import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import GroupCard from '../components/GroupCard';
import OfflineBanner from '../components/OfflineBanner';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
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
          <p className="text-xs text-gray">{user?.email} · {user?.role}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(isAdmin || isPhysicalTrainer) && (
            <button className="btn btn-outline" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
              onClick={() => navigate('/admin')}>
              {isAdmin ? 'Admin' : 'Gestión'}
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
          <AssistantView groups={groups} loading={loading} date={date} />
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2>Grupos del día</h2>
              <span className="badge badge-blue">{groups.length}</span>
            </div>
            {loading ? (
              <div className="spinner" />
            ) : groups.length === 0 ? (
              <div className="alert alert-info">No hay grupos programados para este día.</div>
            ) : (
              groups.map((g) => (
                <GroupCard key={g.id} group={g} onClick={() => handleGroupClick(g)} />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AssistantView({ groups, loading, date }) {
  const [marked, setMarked] = useState({});
  const [saving, setSaving] = useState({});

  async function toggleAssist(groupId, sessionId) {
    if (!sessionId) return;
    setSaving((s) => ({ ...s, [groupId]: true }));
    try {
      await api.post(`/sessions/${sessionId}/assist`, {});
      setMarked((m) => ({ ...m, [groupId]: !m[groupId] }));
    } catch {
      // ignore
    } finally {
      setSaving((s) => ({ ...s, [groupId]: false }));
    }
  }

  if (loading) return <div className="spinner" />;

  return (
    <>
      <h2 className="mb-3">Clases que acompañé</h2>
      {groups.map((g) => (
        <div key={g.id} className="card mb-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{g.code}</div>
              <div className="text-sm text-gray">{g.startTime}–{g.endTime}</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={!!marked[g.id]}
                onChange={() => toggleAssist(g.id, g.sessionId)}
                disabled={saving[g.id]}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      ))}
    </>
  );
}
