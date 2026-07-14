const BALL_COLORS = {
  Verde: 'ball-verde',
  Amarilla: 'ball-amarilla',
  Naranja: 'ball-naranja',
  Roja: 'ball-roja',
};

// Marca de estado para el usuario actual:
// - reportedByMe: ya envié MI reporte hoy (profesor o coordinador) → tarjeta
//   verde completa (fondo + borde), para distinguir de un vistazo lo ya
//   reportado de lo pendiente.
// - mismatch: mi reporte y el del otro rol no coinciden → rojo (conflicto).
// - session REALIZADA (consolidada) → verde "Consolidada".
export default function GroupCard({ group, session, reportedByMe, mismatch, onClick }) {
  const ballClass = BALL_COLORS[group.ballLevel] || 'badge-gray';
  const consolidated = session && ['REALIZADA', 'CANCELADA_MITAD'].includes(session.status);
  const cancelled = session && session.status === 'CANCELADA';

  let mark = null;
  if (mismatch) mark = { cls: 'badge-red', label: '⚠ Conflicto', color: 'var(--red)', bg: 'rgba(232, 82, 106, 0.10)' };
  else if (consolidated) mark = { cls: 'badge-green', label: '✓ Consolidada', color: 'var(--green)', bg: 'rgba(31, 169, 113, 0.14)' };
  else if (reportedByMe) mark = { cls: 'badge-green', label: '✓ Reportada por mí', color: 'var(--green)', bg: 'rgba(31, 169, 113, 0.14)' };
  else if (cancelled) mark = { cls: 'badge-gray', label: 'Cancelada', color: 'var(--gray-400)', bg: 'var(--gray-50, #f7f7f8)' };

  return (
    <div className="card card-tap mb-3" onClick={onClick}
      style={mark ? {
        background: mark.bg,
        border: `1.5px solid ${mark.color}`,
        borderLeft: `6px solid ${mark.color}`,
      } : undefined}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3>{group.code}</h3>
          {mark && (
            <span className={`badge ${mark.cls}`} style={{ fontSize: '0.72rem', fontWeight: 700 }}>
              {mark.label}
            </span>
          )}
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
