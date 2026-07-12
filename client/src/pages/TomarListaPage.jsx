import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import GroupCard from '../components/GroupCard';
import OfflineBanner from '../components/OfflineBanner';
import AssistantDayView from '../components/AssistantDayView';
import { fmtDate } from '../utils/dates';

const BALL_COLOR = { Roja: '#E8526A', Naranja: '#EA8A2E', Verde: '#1FA971', Amarilla: '#E8A23B' };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  return fmtDate(d, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default function TomarListaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [sessionsByGroup, setSessionsByGroup] = useState({});
  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [profFilter, setProfFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  useEffect(() => {
    loadGroups();
  }, [date]);

  async function loadGroups() {
    setLoading(true);
    try {
      const params = date === todayStr() ? { today: 'true' } : {};
      const [data, sessions] = await Promise.all([
        api.get('/groups', params),
        api.get('/sessions', { date }).catch(() => []),
      ]);
      let list = data;
      if (date !== todayStr()) {
        const dow = new Date(date + 'T12:00:00').getDay();
        const dayFields = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const dayField = dayFields[dow];
        list = data.filter((g) => g[dayField]);
      }
      setGroups(list);
      const map = {};
      (sessions || []).forEach((s) => { const gid = s.groupId || s.group?.id; if (gid) map[gid] = s; });
      setSessionsByGroup(map);
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

  const isAssistant = user?.role === 'ASSISTANT';

  const professors = useMemo(() => {
    const m = new Map();
    groups.forEach((g) => { if (g.professor) m.set(g.professor.id, g.professor.name); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [groups]);
  const levels = useMemo(() => [...new Set(groups.map((g) => g.ballLevel).filter(Boolean))], [groups]);

  const filteredGroups = useMemo(() => groups.filter((g) =>
    (!profFilter || g.professor?.id === profFilter) &&
    (!levelFilter || g.ballLevel === levelFilter)
  ), [groups, profFilter, levelFilter]);

  // Agrupar por horario (inicio–fin). Los grupos llegan ordenados por startTime.
  const timeSlots = useMemo(() => {
    const m = new Map();
    for (const g of filteredGroups) {
      const key = `${g.startTime}–${g.endTime}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(g);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredGroups]);

  return (
    <div className="page">
      <OfflineBanner />
      <div className="page-header">
        <div style={{ flex: 1 }}>
          <h1>Tomar lista</h1>
          <p className="text-xs text-gray">{capitalize(formatDate(date))}</p>
        </div>
      </div>

      <div className="page-content">
        <div className="form-group mb-4">
          <label className="form-label">Ver otro día</label>
          <input
            type="date"
            className="form-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {isAssistant ? (
          <AssistantDayView groups={groups} loading={loading} date={date} />
        ) : (
          <>
            <PendingReportsAlert />
            <PendingMakeups />
            <PendingFestivals />
            <div className="flex items-center justify-between mb-3">
              <h2>Grupos del día</h2>
              <span className="badge badge-blue">{filteredGroups.length}</span>
            </div>

            {/* Filtros: profesor + nivel */}
            {groups.length > 0 && (
              <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
                <select className="form-input form-select" style={{ minHeight: 36, width: 'auto', fontSize: '0.85rem' }}
                  value={profFilter} onChange={(e) => setProfFilter(e.target.value)}>
                  <option value="">Todos los profesores</option>
                  {professors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select className="form-input form-select" style={{ minHeight: 36, width: 'auto', fontSize: '0.85rem' }}
                  value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
                  <option value="">Todos los niveles</option>
                  {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                {(profFilter || levelFilter) && (
                  <button className="btn btn-ghost" style={{ minHeight: 36, fontSize: '0.8rem' }}
                    onClick={() => { setProfFilter(''); setLevelFilter(''); }}>✕ Limpiar</button>
                )}
              </div>
            )}

            {loading ? (
              <div className="spinner" />
            ) : filteredGroups.length === 0 ? (
              <div className="alert alert-info">No hay grupos que coincidan para este día.</div>
            ) : (
              timeSlots.map(([slot, slotGroups]) => (
                <div key={slot} className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-sm">🕐 {slot}</span>
                    <span className="text-xs text-gray">{slotGroups.length} grupo{slotGroups.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="card-grid">
                    {slotGroups.map((g) => (
                      <GroupCard key={g.id} group={g} session={sessionsByGroup[g.id]} onClick={() => handleGroupClick(g)} />
                    ))}
                  </div>
                </div>
              ))
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

function PendingFestivals() {
  const navigate = useNavigate();
  const [festivals, setFestivals] = useState([]);

  useEffect(() => {
    api.get('/festivals', { status: 'PROGRAMADA' })
      .then((data) => setFestivals(data || []))
      .catch(() => {});
  }, []);

  if (festivals.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2>Festivales pendientes</h2>
        <span className="badge badge-blue">{festivals.length}</span>
      </div>
      {festivals.map((f) => (
        <div key={f.id} className="card card-tap mb-2" style={{ borderLeft: '3px solid var(--green)' }}
          onClick={() => navigate(`/festivals/${f.id}/attendance`)}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">🎉 {f.title || 'Festival'}</div>
              <div className="text-sm text-gray">
                {fmtDate(f.date)} · {(f.festivalProfessors || []).map((fp) => fp.professor?.name).join(', ') || '—'}
                {' · '}{f.makeupParticipants?.length || 0} est.
              </div>
            </div>
            <span style={{ fontSize: '1.2rem' }}>›</span>
          </div>
        </div>
      ))}
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
