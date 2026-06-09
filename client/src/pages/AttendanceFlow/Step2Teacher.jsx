import { useState, useEffect } from 'react';
import { api } from '../../api/client';

export default function Step2Teacher({ group, substitute, assistant, onSubstituteChange, onAssistantChange, onNext }) {
  const [professors, setProfessors] = useState([]);
  const [assistants, setAssistants] = useState([]);
  const [showProfList, setShowProfList] = useState(false);

  useEffect(() => {
    api.get('/professors', { active: 'true' }).then(setProfessors).catch(() => {});
    api.get('/assistants', { active: 'true' }).then(setAssistants).catch(() => {});
  }, []);

  const displayProf = substitute || group.professor;

  return (
    <div>
      <h2 className="mb-4">¿Quién dictó la clase?</h2>

      <div className="card mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{displayProf?.name || 'Profesor titular'}</div>
            {substitute && <div className="text-xs text-gray">Sustituto</div>}
          </div>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
            onClick={() => setShowProfList(!showProfList)}
          >
            Cambiar
          </button>
        </div>

        {showProfList && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-200)', paddingTop: 12 }}>
            <button
              className={`btn btn-full mb-2 ${!substitute ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => { onSubstituteChange(null); setShowProfList(false); }}
            >
              {group.professor?.name} (titular)
            </button>
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
        <button className="btn btn-primary btn-full btn-lg" onClick={onNext}>
          Continuar →
        </button>
      </div>
    </div>
  );
}
