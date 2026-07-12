const BALL_COLORS = {
  Verde: 'ball-verde',
  Amarilla: 'ball-amarilla',
  Naranja: 'ball-naranja',
  Roja: 'ball-roja',
};

// Una sesión ya reportada (REALIZADA / cancelada) se marca en verde.
const REPORTED = { REALIZADA: 'Reportada', CANCELADA: 'Cancelada', CANCELADA_MITAD: 'Reportada' };

export default function GroupCard({ group, session, onClick }) {
  const ballClass = BALL_COLORS[group.ballLevel] || 'badge-gray';
  const reported = session && REPORTED[session.status];

  return (
    <div className="card card-tap mb-3" onClick={onClick}
      style={reported ? { borderLeft: '4px solid var(--green)' } : undefined}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3>{group.code}</h3>
          {reported && <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>✓ {reported}</span>}
        </div>
        <span className={`badge ${ballClass}`}>
          {group.ballLevel ? `${group.ballLevel}${group.subLevel ? ` ${group.subLevel}` : ''}` : '—'}
        </span>
      </div>
      <div className="text-sm text-gray flex gap-3 flex-wrap">
        <span>🕐 {group.startTime}–{group.endTime}</span>
        {group.court && <span>🎾 Cancha {group.court}</span>}
        {group.professor && <span>👤 {group.professor.name}</span>}
      </div>
    </div>
  );
}
