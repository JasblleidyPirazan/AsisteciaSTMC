import { useState, useEffect } from 'react';
import { api } from '../../api/client';

export default function Step2Teacher({ group, substitute, assistant, dictatedByOwner, notDictatedNote,
  onSubstituteChange, onAssistantChange, onDictatedChange, onNoteChange, onNext }) {
  const [professors, setProfessors] = useState([]);
  const [assistants, setAssistants] = useState([]);
  const [showProfList, setShowProfList] = useState(false);

  useEffect(() => {
    api.get('/professors', { active: 'true' }).then(setProfessors).catch(() => {});
    api.get('/assistants', { active: 'true' }).then(setAssistants).catch(() => {});
  }, []);

  const displayProf = substitute || group.professor;
  // "No dicté la clase yo" requires who dictated it + a mandatory observation
  const canContinue = dictatedByOwner || (substitute && notDictatedNote.trim());

  return (
    <div>
      <h2 className="mb-4">¿Quién dictó la clase?</h2>

      {/* Dictada por el titular — Sí por defecto */}
      <div className="card mb-3">
        <div className="toggle-row" style={{ padding: 0 }}>
          <div>
            <div className="font-medium">¿La dictó el profesor titular?</div>
            <div className="text-xs text-gray">
              {group.professor?.name || 'Titular'} · desmarca si la dictó otra persona
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={dictatedByOwner}
              onChange={(e) => {
                onDictatedChange(e.target.checked);
                if (e.target.checked) {
                  onSubstituteChange(null);
                  onNoteChange('');
                } else {
                  setShowProfList(true);
                }
              }}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      {!dictatedByOwner && (
        <>
          <div className="card mb-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{substitute?.name || 'Selecciona quién la dictó *'}</div>
                {substitute && <div className="text-xs text-gray">Dictó la clase</div>}
              </div>
              <button
                className="btn btn-ghost"
                style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
                onClick={() => setShowProfList(!showProfList)}
              >
                {substitute ? 'Cambiar' : 'Elegir'}
              </button>
            </div>

            {showProfList && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
                {professors
                  .filter((p) => p.id !== group.professor?.id)
                  .map((p) => (
                    <button
                      key={p.id}
                      className={`btn btn-full mb-2 ${substitute?.id === p.id ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => { onSubstituteChange(p); setShowProfList(false); }}
                    >
                      {p.name}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Observación (obligatoria) *</label>
            <textarea
              className="form-input"
              rows={2}
              placeholder='Ej: "Clase no dictada por el profe titular — cita médica"'
              value={notDictatedNote}
              onChange={(e) => onNoteChange(e.target.value)}
              style={{ resize: 'vertical' }}
            />
            <span className="text-xs text-gray">
              Queda registrada para revisión del coordinador.
            </span>
          </div>
        </>
      )}

      {dictatedByOwner && (
        <div className="card mb-3" style={{ background: 'var(--green-light)' }}>
          <div className="text-sm">
            ✅ Dictada por <strong>{displayProf?.name || 'el titular'}</strong>
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Asistente (opcional)</label>
        <select
          className="form-input form-select"
          value={assistant?.id || ''}
          onChange={(e) => {
            const found = assistants.find((a) => a.id === e.target.value);
            onAssistantChange(found || null);
          }}
        >
          <option value="">Sin asistente</option>
          {assistants.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="action-bar">
        <button className="btn btn-primary btn-full btn-lg" onClick={onNext} disabled={!canContinue}>
          Continuar →
        </button>
      </div>
      <div style={{ height: 72 }} />
    </div>
  );
}
