import { useState } from 'react';
import { api } from '../api/client';
import { POLICIES_TEXT } from '../utils/policies';

/**
 * Blocking policies-acceptance modal for the parent portal's first login.
 * No overlay dismissal: the user must check the box and accept to continue.
 */
export default function PoliciesModal({ onAccepted }) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAccept() {
    setSaving(true);
    setError('');
    try {
      await api.post('/auth/accept-policies', {});
      onAccepted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ alignItems: 'center', padding: 16 }}>
      <div className="modal-content" style={{ borderRadius: 'var(--radius)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <h3 className="mb-1">Políticas de la Escuela</h3>
        <p className="text-sm text-gray mb-3">
          Antes de continuar, lee y acepta el reglamento de la Escuela.
        </p>

        <div
          className="card mb-3"
          style={{ overflowY: 'auto', flex: 1, minHeight: 200, whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: 1.5 }}
        >
          {POLICIES_TEXT}
        </div>

        {error && <div className="alert alert-error mb-2">{error}</div>}

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={checked} style={{ marginTop: 3 }}
            onChange={(e) => setChecked(e.target.checked)} />
          <span className="text-sm">
            He leído y acepto las políticas y el reglamento de la Escuela de Tenis Santa María.
          </span>
        </label>

        <button
          className="btn btn-primary btn-full btn-lg"
          disabled={!checked || saving}
          onClick={handleAccept}
        >
          {saving ? 'Guardando...' : 'Acepto las políticas'}
        </button>
      </div>
    </div>
  );
}
