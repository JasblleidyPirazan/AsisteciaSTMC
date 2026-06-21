import { useState } from 'react';

// label → enum CancellationType
const CANCEL_REASONS = [
  { label: 'Lluvia', type: 'LLUVIA' },
  { label: 'Festivo', type: 'FESTIVO' },
  { label: 'Mantenimiento', type: 'MANTENIMIENTO' },
  { label: 'Emergencia', type: 'EMERGENCIA' },
  { label: 'Otro', type: 'OTRO' },
];

export default function Step1ClassStatus({ group, onHeld, onCancel, loading }) {
  const [showCancel, setShowCancel] = useState(false);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');

  return (
    <div>
      <h2 className="mb-2">¿La clase se realizó hoy?</h2>
      <p className="text-gray text-sm mb-4">{group.code} · {group.startTime}–{group.endTime}</p>

      {!showCancel ? (
        <div className="flex-col gap-3" style={{ display: 'flex' }}>
          <button
            className="btn btn-success btn-full btn-lg"
            onClick={onHeld}
            disabled={loading}
          >
            ✅ Sí, se realizó
          </button>
          <button
            className="btn btn-danger btn-full btn-lg"
            onClick={() => setShowCancel(true)}
            disabled={loading}
          >
            ❌ No, fue cancelada
          </button>
        </div>
      ) : (
        <div>
          <h3 className="mb-3">Motivo de cancelación</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CANCEL_REASONS.map((r) => (
              <button
                key={r.type}
                className={`btn btn-full ${selected?.type === r.type ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSelected(r)}
                style={{ justifyContent: 'flex-start', paddingLeft: 20 }}
              >
                {selected?.type === r.type ? '✓ ' : ''}{r.label}
              </button>
            ))}
          </div>

          {selected?.type === 'OTRO' && (
            <div className="form-group mt-3">
              <label className="form-label">Especifica el motivo</label>
              <textarea
                className="form-input"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe el motivo..."
                style={{ resize: 'vertical' }}
              />
            </div>
          )}

          <div className="action-bar">
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowCancel(false)}>
              Volver
            </button>
            <button
              className="btn btn-danger"
              style={{ flex: 2 }}
              onClick={() => onCancel({
                cancellationType: selected.type,
                cancellationReason: selected.type === 'OTRO' ? note.trim() : selected.label,
              })}
              disabled={!selected || (selected?.type === 'OTRO' && !note.trim()) || loading}
            >
              Confirmar cancelación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
