// Fila de estudiante con botones grandes P / A / J (HU-AST-01).
export default function StudentRow({ student, onStatus, onJustification, onRemove }) {
  const STATES = [
    ['PRESENTE', 'P'],
    ['AUSENTE', 'A'],
    ['JUSTIFICADA', 'J'],
  ];
  return (
    <div className="student-item">
      <div className="row">
        <span className="student-name">
          {student.name}
          {student.attendanceType === 'REPOSICION' && <span className="tag repo" style={{ marginLeft: 6 }}>reposición</span>}
        </span>
        {onRemove && <button className="back" style={{ width: 32, height: 32, background: '#fee2e2', color: '#ef4444' }} onClick={onRemove}>×</button>}
      </div>
      <div className="status-btns">
        {STATES.map(([value, label]) => (
          <button
            key={value}
            className={`status-btn ${label} ${student.status === value ? 'active' : ''}`}
            onClick={() => onStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {student.status === 'JUSTIFICADA' && (
        <input
          style={{ marginTop: 8, width: '100%', minHeight: 44, padding: '8px 10px', border: '2px solid var(--border)', borderRadius: 8 }}
          placeholder="Descripción (opcional)"
          value={student.justification || ''}
          onChange={(e) => onJustification(e.target.value)}
        />
      )}
    </div>
  );
}
