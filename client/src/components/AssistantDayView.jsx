import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';

// Colores por nivel (bola) para que el asistente ubique su clase de un vistazo.
const LEVEL_COLOR = {
  Roja: '#E8526A', Naranja: '#EA8A2E', Amarilla: '#E8A23B', Verde: '#1FA971',
  Intermedio: '#7A5AF8', Avanzado: '#3F52A8',
};
function levelColor(level) {
  return LEVEL_COLOR[level] || 'var(--gray-300)';
}

/**
 * Day view for assistants. Marca las clases que acompañó — NO requiere que el
 * profesor o el coordinador hayan reportado primero: al marcar, se crea/actualiza
 * la sesión con la confirmación del asistente (`POST /sessions/assist` por
 * grupo+fecha). Desmarcar corrige el error. El pago se habilita solo con la
 * triple coincidencia (profesor + asistente + coordinador).
 */
export default function AssistantDayView({ groups, loading, date, showRegular = true }) {
  const { user } = useAuth();
  const [sessionsByGroup, setSessionsByGroup] = useState({});
  const [makeups, setMakeups] = useState([]);
  const [myAssistantId, setMyAssistantId] = useState(null);
  const [saving, setSaving] = useState({});
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(''); // confirmación transitoria al guardar

  const [profFilter, setProfFilter] = useState('');
  const [courtFilter, setCourtFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  useEffect(() => {
    setLoadingSessions(true);
    Promise.all([
      api.get('/sessions', { date }),
      api.get('/assistants', { active: 'true' }),
      // Las reposiciones del día se acompañan igual que una clase regular.
      api.get('/makeups', { date }).catch(() => []),
    ]).then(([sessions, assistants, mks]) => {
      const map = {};
      sessions.forEach((s) => { map[s.groupId || s.group?.id] = s; });
      setSessionsByGroup(map);
      const mine = assistants.find((a) => a.user?.email === user?.email);
      setMyAssistantId(mine?.id || null);
      setMakeups((mks || []).filter((m) => m.status !== 'CANCELADA'));
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
    if (!myAssistantId) return;
    const session = sessionsByGroup[group.id];
    const isConfirmed = !!session && session.assistantConfirmedId === myAssistantId;
    setSaving((s) => ({ ...s, [group.id]: true }));
    setError('');
    try {
      const updated = await api.post('/sessions/assist', {
        groupId: group.id, date, remove: isConfirmed,
      });
      setSessionsByGroup((m) => ({ ...m, [group.id]: updated || null }));
      setFlash(isConfirmed
        ? `✓ Corregido: se quitó tu acompañamiento de ${group.code}`
        : `✓ Guardado: registraste tu acompañamiento de ${group.code}`);
      clearTimeout(toggleAssist._t);
      toggleAssist._t = setTimeout(() => setFlash(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving((s) => ({ ...s, [group.id]: false }));
    }
  }

  // Reposición grupal: se confirma por id de sesión (no tiene grupo ni horario).
  async function toggleAssistMakeup(makeup) {
    if (!myAssistantId) return;
    const isConfirmed = makeup.assistantConfirmedId === myAssistantId;
    setSaving((s) => ({ ...s, [makeup.id]: true }));
    setError('');
    try {
      const updated = await api.post(`/sessions/${makeup.id}/assist`, { remove: isConfirmed });
      setMakeups((ms) => ms.map((m) => (m.id === makeup.id ? { ...m, ...updated } : m)));
      const label = makeup.title || 'la reposición';
      setFlash(isConfirmed
        ? `✓ Corregido: se quitó tu acompañamiento de ${label}`
        : `✓ Guardado: registraste tu acompañamiento de ${label}`);
      clearTimeout(toggleAssist._t);
      toggleAssist._t = setTimeout(() => setFlash(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving((s) => ({ ...s, [makeup.id]: false }));
    }
  }

  // Agrupa las clases por horario de inicio para separarlas visualmente.
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

  // Estado del acompañamiento de ESTE asistente (secundario al color de nivel).
  function assistState(session) {
    if (!session || session.assistantConfirmedId !== myAssistantId) return null;
    const reportedMe = session.assistantId === myAssistantId;
    // Todo lo que coincide se valida automáticamente: en una clase regular
    // consolidada (profesor y coordinador coincidieron), no hace falta que el
    // coordinador valide a mano — igual que en el motor de costos.
    const coordinatorOk = !!session.coordinatorValidatedAt ||
      (session.kind === 'REGULAR' && session.consolidationStatus === 'MATCHED');
    if (reportedMe && coordinatorOk) {
      return { color: 'var(--green)', label: '✓ Habilitada para pago' };
    }
    if (reportedMe) {
      return { color: 'var(--yellow)', label: 'Pendiente: falta que coincidan profesor y coordinador' };
    }
    return { color: 'var(--blue)', label: 'Registrada · falta el reporte del profesor' };
  }

  // Estado del acompañamiento en una reposición. A diferencia del grupo regular,
  // el coordinador ya dejó asignado el asistente al crearla, así que "quién la
  // dictó" solo queda en firme cuando se reporta: hasta entonces está pendiente.
  function makeupState(m) {
    if (!myAssistantId || m.assistantConfirmedId !== myAssistantId) return null;
    if (m.status !== 'REALIZADA') {
      return { color: 'var(--blue)', label: 'Registrada · falta el reporte del profesor' };
    }
    const reportedMe = m.assistantId === myAssistantId;
    if (reportedMe && m.coordinatorValidatedAt) {
      return { color: 'var(--green)', label: '✓ Habilitada para pago' };
    }
    if (reportedMe) {
      return { color: 'var(--yellow)', label: 'Pendiente: falta la validación del coordinador' };
    }
    return { color: 'var(--yellow)', label: 'El profesor reportó otro asistente' };
  }

  if (loading || loadingSessions) return <div className="spinner" />;

  return (
    <>
      <h2 className="mb-1">Clases del día</h2>
      <p className="text-sm text-gray mb-3">
        Marca las clases que acompañaste{showRegular ? '' : ' (hoy solo hay reposiciones)'}. Puedes desmarcar
        para corregir. No hace falta que el profesor o el coordinador hayan reportado.
      </p>
      {error && <div className="alert alert-error mb-3">{error}</div>}
      {flash && (
        <div className="save-flash" role="status">{flash}</div>
      )}

      {showRegular && (
      <>
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

      {/* Leyenda de niveles */}
      <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
        {['Roja', 'Naranja', 'Amarilla', 'Verde'].map((l) => (
          <span key={l} className="text-xs text-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className="legend-dot" style={{ background: levelColor(l) }} />{l}
          </span>
        ))}
      </div>

      {filtered.length === 0 && <div className="alert alert-info">No hay clases para este filtro.</div>}
      {byTimeSlot(filtered).map(([time, gs]) => (
        <div key={time} className="mb-2">
          <div className="time-slot-header">🕐 {time}</div>
          {gs.map((g) => {
        const session = sessionsByGroup[g.id];
        const isConfirmed = !!session && !!myAssistantId && session.assistantConfirmedId === myAssistantId;
        const confirmedByOther = !!session?.assistantConfirmedId && session.assistantConfirmedId !== myAssistantId;
        const state = assistState(session);
        const color = levelColor(g.ballLevel);
        return (
          <div key={g.id} className="card mb-3"
            style={{ borderLeft: `6px solid ${color}`, background: isConfirmed ? 'var(--surface-2, var(--gray-50))' : undefined }}>
            <div className="flex items-center justify-between">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  <span className="legend-dot" style={{ background: color, width: 12, height: 12 }} />
                  <span className="font-medium">{g.code}</span>
                  {g.ballLevel && (
                    <span className="badge" style={{ background: color, color: '#fff', fontSize: '0.68rem' }}>
                      {g.ballLevel}{g.subLevel ? ` ${g.subLevel}` : ''}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray" style={{ marginTop: 4 }}>
                  {g.startTime}–{g.endTime}{g.court ? ` · Cancha ${g.court}` : ''}
                </div>
                {g.professor && <div className="text-xs text-gray">👤 {g.professor.name}</div>}
                {state && <div className="text-xs mt-2" style={{ color: state.color, fontWeight: 600 }}>{state.label}</div>}
                {confirmedByOther && (
                  <div className="text-xs text-gray mt-1">Confirmada por otro asistente</div>
                )}
              </div>
              <label className="toggle" style={{ flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={isConfirmed}
                  onChange={() => toggleAssist(g)}
                  disabled={confirmedByOther || saving[g.id] || !myAssistantId}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        );
          })}
        </div>
      ))}
      </>
      )}

      {/* Reposiciones grupales del día: se acompañan igual que una clase regular */}
      {makeups.length > 0 && (
        <div style={{ marginTop: showRegular ? 20 : 0 }}>
          <div className="time-slot-header">🔁 Reposiciones del día</div>
          {makeups.map((m) => {
            const isConfirmed = !!myAssistantId && m.assistantConfirmedId === myAssistantId;
            const confirmedByOther = !!m.assistantConfirmedId && m.assistantConfirmedId !== myAssistantId;
            const assignedToMe = !!myAssistantId && m.assistantId === myAssistantId;
            const state = makeupState(m);
            const professor = m.substituteProfessor || m.makeupProfessor;
            return (
              <div key={m.id} className="card mb-3"
                style={{ borderLeft: '6px solid var(--blue)', background: isConfirmed ? 'var(--surface-2, var(--gray-50))' : undefined }}>
                <div className="flex items-center justify-between">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">🔁 {m.title || 'Reposición grupal'}</span>
                      {assignedToMe && (
                        <span className="badge badge-blue" style={{ fontSize: '0.68rem' }}>Asignada a ti</span>
                      )}
                    </div>
                    <div className="text-sm text-gray" style={{ marginTop: 4 }}>
                      {m.makeupParticipants?.length || 0} estudiante{(m.makeupParticipants?.length || 0) !== 1 ? 's' : ''}
                      {m.status === 'REALIZADA' ? ' · reportada' : ' · sin reportar'}
                    </div>
                    {professor && <div className="text-xs text-gray">👤 {professor.name}</div>}
                    {state && <div className="text-xs mt-2" style={{ color: state.color, fontWeight: 600 }}>{state.label}</div>}
                    {confirmedByOther && (
                      <div className="text-xs text-gray mt-1">Confirmada por otro asistente</div>
                    )}
                  </div>
                  <label className="toggle" style={{ flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={isConfirmed}
                      onChange={() => toggleAssistMakeup(m)}
                      disabled={confirmedByOther || saving[m.id] || !myAssistantId}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!showRegular && makeups.length === 0 && (
        <div className="alert alert-info">No hay reposiciones programadas para este día.</div>
      )}
    </>
  );
}
