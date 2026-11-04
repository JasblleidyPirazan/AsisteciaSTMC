import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import MakeupBookingPage from './MakeupBookingPage';

// Enlace de reprogramación por grupo (/reprogramar/g/:groupToken). Sin login:
// un solo enlace para todo el grupo. El acudiente elige a su hijo de la lista
// (solo los que tienen clases por reprogramar por festivos o recesos) y agenda
// en los mismos turnos que las reposiciones. Datos de /makeup-booking/group/:groupToken.

export default function GroupReprogramPage() {
  const { groupToken } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = () => api.get(`/makeup-booking/group/${groupToken}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [groupToken]);

  if (selected) {
    return (
      <MakeupBookingPage
        purpose="REPROGRAMACION"
        apiBase={`/makeup-booking/group/${groupToken}/students/${selected}`}
        onBack={() => { setSelected(null); load(); }}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ flex: 1 }}>
          <h1>📆 Agenda las clases reprogramadas</h1>
          <p className="text-xs text-gray">
            Escuela de Tenis Santa María{data?.group ? ` · Grupo ${data.group.code}` : ''}
          </p>
        </div>
      </div>
      <div className="page-content">
        {error && <div className="alert alert-error mb-3">{error}</div>}
        {!data && !error && <div className="spinner" />}
        {data && (
          <>
            <p className="text-sm mb-3">
              Estas clases no se dictaron por festivos o días de receso. <strong>Toca el nombre de tu hijo o hija</strong> para
              ver sus clases por reprogramar y reservar un turno.
            </p>
            {data.students.length === 0 && (
              <div className="alert alert-info">Ningún estudiante de este grupo tiene clases por reprogramar. 🙌</div>
            )}
            {data.students.map((s) => (
              <button key={s.id} className="card mb-2" onClick={() => setSelected(s.id)}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--gray-200)' }}>
                <div className="flex items-center justify-between" style={{ gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-gray">
                      {s.pending} por reprogramar
                      {s.reserved > 0 && ` · ${s.reserved} agendada${s.reserved !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                  {s.toSchedule > 0
                    ? <span className="badge badge-blue">Agendar {s.toSchedule}</span>
                    : <span className="badge badge-green">✓ Todo agendado</span>}
                </div>
              </button>
            ))}
            {data.rules?.slots?.length > 0 && (
              <p className="text-xs text-gray mt-3">
                Turnos: {data.rules.slots.map((t) => `${t.day} ${t.label}`).join(' · ')}. Máximo {data.rules.capacity} estudiantes por turno.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
