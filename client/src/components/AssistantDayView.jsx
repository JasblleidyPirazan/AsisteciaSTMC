import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';

/**
 * Day view for assistants (req: clases del día con filtros por profesor,
 * cancha y nivel, ordenadas por horario). The toggle records the assistant's
 * own confirmation (assistantConfirmedId); pay turns green only when it
 * matches the professor's report AND the coordinator validates.
 */
export default function AssistantDayView({ groups, loading, date }) {
  const { user } = useAuth();
  const [sessionsByGroup, setSessionsByGroup] = useState({});
  const [myAssistantId, setMyAssistantId] = useState(null);
  const [saving, setSaving] = useState({});
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [profFilter, setProfFilter] = useState('');
  const [courtFilter, setCourtFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  useEffect(() => {
    setLoadingSessions(true);
    Promise.all([
      api.get('/sessions', { date }),
      api.get('/assistants', { active: 'true' }),
    ]).then(([sessions, assistants]) => {
      const map = {};
      sessions.forEach((s) => { map[s.groupId || s.group?.id] = s; });
      setSessionsByGroup(map);
      const mine = assistants.find((a) => a.user?.email === user?.email);
      setMyAssistantId(mine?.id || null);
    }).catch(() => {}).finally(() => setLoadingSessions(false));
  }, [date, user?.email]);

  const professors = useMemo(
    () => [...new Map(groups.filter((g) => g.professor).map((g) => [g.professor.id, g.professor])).values()],
    [groups]
  );
  const courts = useMemo(
    () => [...new Set(groups.map((g) => g.court).filter(Boolean))].sort((a, b) => a - b),
    [groups]
  );
  const levels = useMemo(
    () => [...new Set(groups.map((g) => g.ballLevel).filter(Boolean))],
    [groups]
  );

  const filtered = groups.filter((g) =>
    (!profFilter || g.professor?.id === profFilter) &&
    (!courtFilter || String(g.court) === courtFilter) &&
    (!levelFilter || g.ballLevel === levelFilter)
  );

  async function toggleAssist(group) {
    const session = sessionsByGroup[group.id];
    if (!session) return;
    const isConfirmed = session.assistantConfirmedId === myAssistantId;
    setSaving((s) => ({ ...s, [group.id]: true }));
    setError('');
    try {
      const updated = await api.post(`/sessions/${session.id}/assist`, isConfirmed ? { remove: true } : {});
      setSessionsByGroup((m) => ({
        ...m,
        [group.id]: {
          ...session,
          assistantConfirmedId: updated.assistantConfirmedId,
          coordinatorValidatedAt: updated.coordinatorValidatedAt,
        },
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving((s) => ({ ...s, [group.id]: false }));
    }
  }

  // Semáforo del pago para ESTE asistente en la sesión
  function payState(session) {
    if (!session || session.status === 'PROGRAMADA') {
      return { color: 'var(--gray-400)', label: 'La clase aún no ha sido reportada' };
    }
    const reportedMe = session.assistantId === myAssistantId;
    const confirmedMe = session.assistantConfirmedId === myAssistantId;
    if (reportedMe && confirmedMe && session.coordinatorValidatedAt) {
      return { color: 'var(--green)', label: '✓ Validada — habilitada para pago' };
    }
    if (reportedMe && confirmedMe) {
      return { color: 'var(--yellow)', label: 'Pendiente de validación del coordinador' };
    }
    if (confirmedMe && !reportedMe) {
      return { color: 'var(--yellow)', label: 'El profesor no te reportó en esta clase' };
    }
    if (reportedMe && !confirmedMe) {
      return { color: 'var(--yellow)', label: 'El profesor te reportó — confirma tu acompañamiento' };
    }
    return null;
  }

  if (loading || loadingSessions) return <div className="spinner" />;

  return (
    <>
      <h2 className="mb-3">Clases del día</h2>
      {error && <div className="alert alert-error mb-3">{error}</div>}

      {/* Filtros: profesor / cancha / nivel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <select className="form-input form-select" style={{ minHeight: 40, fontSize: '0.8rem' }}
          value={profFilter} onChange={(e) => setProfFilter(e.target.value)}>
          <option value="">Profesor</option>
          {professors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="form-input form-select" style={{ minHeight: 40, fontSize: '0.8rem' }}
          value={courtFilter} onChange={(e) => setCourtFilter(e.target.value)}>
          <option value="">Cancha</option>
          {courts.map((c) => <option key={c} value={String(c)}>Cancha {c}</option>)}
        </select>
        <select className="form-input form-select" style={{ minHeight: 40, fontSize: '0.8rem' }}
          value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">Nivel</option>
          {levels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {filtered.length === 0 && <div className="alert alert-info">No hay clases para este filtro.</div>}
      {filtered.map((g) => {
        const session = sessionsByGroup[g.id];
        const isConfirmed = !!session && !!myAssistantId && session.assistantConfirmedId === myAssistantId;
        const confirmedByOther = !!session?.assistantConfirmedId && !isConfirmed;
        const state = payState(session);
        return (
          <div key={g.id} className="card mb-3"
            style={state ? { borderLeft: `4px solid ${state.color}` } : undefined}>
            <div className="flex items-center justify-between">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="font-medium">{g.code}</div>
                <div className="text-sm text-gray">
                  {g.startTime}–{g.endTime}
                  {g.court ? ` · Cancha ${g.court}` : ''}
                  {g.ballLevel ? ` · ${g.ballLevel}${g.subLevel ? ` ${g.subLevel}` : ''}` : ''}
                </div>
                {g.professor && <div className="text-xs text-gray">👤 {g.professor.name}</div>}
                {state && <div className="text-xs mt-2" style={{ color: state.color }}>{state.label}</div>}
                {confirmedByOther && (
                  <div className="text-xs text-gray">Confirmada por otro asistente</div>
                )}
              </div>
              <label className="toggle" style={{ flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={isConfirmed}
                  onChange={() => toggleAssist(g)}
                  disabled={!session || confirmedByOther || saving[g.id] || !myAssistantId}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        );
      })}
    </>
  );
}
