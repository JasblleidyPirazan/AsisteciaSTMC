import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import GroupCard from '../components/GroupCard';
import OfflineBanner from '../components/OfflineBanner';
import AssistantDayView from '../components/AssistantDayView';
import { fmtDate } from '../utils/dates';
import { cacheGet, cacheSet, CACHE_KEYS } from '../utils/offlineCache';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  return fmtDate(d, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [sessionByGroup, setSessionByGroup] = useState({});
  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [exclusions, setExclusions] = useState({}); // { 'YYYY-MM-DD': reason }

  // El reporte propio del usuario: profesor → PROFESSOR, coordinador → COORDINATOR
  const reporterType = user?.role === 'TEACHER' ? 'PROFESSOR' : 'COORDINATOR';

  // Fechas excluidas del semestre (festivos/vacaciones): no hay clases regulares,
  // pero sí se pueden crear reposiciones.
  useEffect(() => {
    api.get('/semesters/active').then((sem) => {
      const map = {};
      (sem?.exclusions || []).forEach((e) => { map[String(e.date).slice(0, 10)] = e.reason || null; });
      setExclusions(map);
    }).catch(() => {});
  }, []);

  const excludedReason = Object.prototype.hasOwnProperty.call(exclusions, date) ? (exclusions[date] || '') : null;
  const isExcluded = excludedReason !== null;

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
      const map = {};
      (sessions || []).forEach((s) => { map[s.groupId || s.group?.id] = s; });
      setSessionByGroup(map);
      // Cache la lista completa del día para poder mostrarla sin conexión.
      cacheSet(CACHE_KEYS.groups, data);
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
      const cached = cacheGet(CACHE_KEYS.groups, []);
      if (cached.length) setGroups(cached);
    } finally {
      setLoading(false);
    }
  }

  function handleGroupClick(group) {
    navigate(`/attendance/${group.id}`, { state: { group, date } });
  }

  const isAssistant = user?.role === 'ASSISTANT';

  // Agrupa los grupos del día por horario de inicio, para separarlos visualmente.
  function byTimeSlot(list) {
    const sorted = [...list].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    const map = new Map();
    for (const g of sorted) {
      const t = g.startTime || '—';
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(g);
    }
    return [...map.entries()];
  }

  return (
    <div className="page">
      <OfflineBanner />
      <div className="page-header">
        <div style={{ flex: 1 }}>
          <h1>Grupos del día</h1>
          <p className="text-xs text-gray">Hola, {user?.email}</p>
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

        {isExcluded && (
          <div className="alert alert-info mb-3" style={{ borderLeft: '4px solid var(--yellow)' }}>
            <div className="font-medium">📅 Día excluido del semestre{excludedReason ? ` · ${excludedReason}` : ''}</div>
            <div className="text-sm mt-1">
              No hay clases regulares este día. Sí puedes crear y reportar <strong>reposiciones</strong>.
            </div>
          </div>
        )}

        {isAssistant ? (
          isExcluded ? null : <AssistantDayView groups={groups} loading={loading} date={date} />
        ) : (
          <>
            <PendingReportsAlert />
            <ReportConflictsAlert />
            <PendingMakeups />
            {/* Professors don't report festivals — only coordinator/admin do. */}
            {['ADMIN', 'PHYSICAL_TRAINER', 'SUPERADMIN'].includes(user?.role) && <PendingFestivals />}
            {!isExcluded && (
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
              byTimeSlot(groups).map(([time, gs]) => (
                <div key={time} className="mb-3">
                  <div className="time-slot-header">🕐 {time}</div>
                  <div className="card-grid">
                    {gs.map((g) => {
                      const session = sessionByGroup[g.id];
                      const reportedByMe = !!session?.reports?.some((r) => r.reporterType === reporterType);
                      const mismatch = session?.consolidationStatus === 'MISMATCH';
                      return (
                        <GroupCard key={g.id} group={g} session={session}
                          reportedByMe={reportedByMe} mismatch={mismatch}
                          onClick={() => handleGroupClick(g)} />
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            </>
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
    if (!['TEACHER', 'ADMIN', 'PHYSICAL_TRAINER', 'SUPERADMIN'].includes(user?.role)) return;
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

function ReportConflictsAlert() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!['TEACHER', 'PHYSICAL_TRAINER', 'SUPERADMIN'].includes(user?.role)) return;
    api.get('/alerts/report-conflicts').then(setData).catch(() => {});
  }, [user?.role]);

  if (!data || data.total === 0) return null;

  return (
    <div className="alert alert-error mb-4" style={{ marginBottom: 16, cursor: 'pointer' }}
      onClick={() => navigate('/admin/conflicts')}>
      <div className="font-medium">
        ⚖️ {data.total} clase{data.total !== 1 ? 's' : ''} con reportes en conflicto
      </div>
      <div className="text-sm mt-1">
        El reporte del profesor y del coordinador no coinciden. Toca para revisar y ajustar.
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

