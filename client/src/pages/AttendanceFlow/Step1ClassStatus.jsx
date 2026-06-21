import { useState } from 'react';

const CANCEL_REASONS = ['Lluvia', 'Festivo', 'Mantenimiento', 'Emergencia', 'Otro'];

export default function Step1ClassStatus({ group, onHeld, onCancel, loading }) {
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState('');

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
                key={r}
                className={`btn btn-full ${reason === r ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setReason(r)}
                style={{ justifyContent: 'flex-start', paddingLeft: 20 }}
              >
                {reason === r ? '✓ ' : ''}{r}
              </button>
            ))}
          </div>
          <div className="action-bar">
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowCancel(false)}>
              Volver
            </button>
            <button
              className="btn btn-danger"
              style={{ flex: 2 }}
              onClick={() => onCancel(reason)}
              disabled={!reason || loading}
            >
              Confirmar cancelación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
