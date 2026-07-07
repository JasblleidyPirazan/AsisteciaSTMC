const BALL_COLORS = {
  Verde: 'ball-verde',
  Amarilla: 'ball-amarilla',
  Naranja: 'ball-naranja',
  Roja: 'ball-roja',
};

export default function GroupCard({ group, onClick }) {
  const ballClass = BALL_COLORS[group.ballLevel] || 'badge-gray';

  return (
    <div className="card card-tap mb-3" onClick={onClick}>
      <div className="flex items-center justify-between mb-2">
        <h3>{group.code}</h3>
        <span className={`badge ${ballClass}`}>{group.ballLevel || '—'}</span>
      </div>
      <div className="text-sm text-gray flex gap-3 flex-wrap">
        <span>🕐 {group.startTime}–{group.endTime}</span>
        {group.court && <span>🎾 Cancha {group.court}</span>}
        {group.professor && <span>👤 {group.professor.name}</span>}
      </div>
    </div>
  );
}
