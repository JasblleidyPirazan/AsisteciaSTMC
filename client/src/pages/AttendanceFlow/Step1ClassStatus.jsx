import { useState } from 'react';

// Structured cancellation categories — LLUVIA feeds the per-group rain alert
const CANCEL_OPTIONS = [
  { category: 'LLUVIA', label: '🌧️ Cancelada por lluvia' },
  { category: 'SIN_ESTUDIANTES', label: '👥 No llegaron estudiantes' },
  { category: 'OTRA', label: '📝 Otro motivo' },
];

export default function Step1ClassStatus({ group, onHeld, onCancel, loading }) {
  const [showCancel, setShowCancel] = useState(false);
  const [category, setCategory] = useState('');
  const [reasonText, setReasonText] = useState('');

  const needsText = category === 'OTRA';
  const canConfirm = category && (!needsText || reasonText.trim());

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
            {CANCEL_OPTIONS.map((opt) => (
              <button
                key={opt.category}
                className={`btn btn-full ${category === opt.category ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setCategory(opt.category)}
                style={{ justifyContent: 'flex-start', paddingLeft: 20 }}
              >
                {category === opt.category ? '✓ ' : ''}{opt.label}
              </button>
            ))}
          </div>
          {needsText && (
            <div className="form-group mt-3">
              <label className="form-label">Describe el motivo *</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Ej: Mantenimiento de cancha, emergencia..."
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
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
              onClick={() => onCancel(category, reasonText.trim())}
              disabled={!canConfirm || loading}
            >
              Confirmar cancelación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
