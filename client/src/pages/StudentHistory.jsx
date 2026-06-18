import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { Banner, Empty, Header, Loading } from '../components/ui.jsx';

const STATUS_TAG = {
  PRESENTE: { label: 'Presente', cls: 'P' },
  AUSENTE: { label: 'Ausente', cls: 'A' },
  JUSTIFICADA: { label: 'Justificada', cls: 'J' },
};

// Historial de asistencia de un estudiante con conteo por período.
export default function StudentHistory() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/students/${id}/history`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="content"><Banner>{error}</Banner></div>;
  if (!data) return <Loading message="Cargando historial…" />;

  return (
    <>
      <Header title={data.student.name} back="/students" />
      <div className="content">
        <div className="card">
          <div className="summary-line"><span>Clases registradas</span><strong>{data.counts.total}</strong></div>
          <div className="summary-line"><span>Asistencias</span><strong>{data.counts.present}</strong></div>
          <div className="summary-line"><span>Reposiciones</span><strong>{data.counts.makeups}</strong></div>
          <div className="row" style={{ marginTop: 6 }}>
            <span>% de asistencia</span>
            <strong>{data.counts.total ? Math.round((data.counts.present / data.counts.total) * 100) : 0}%</strong>
          </div>
        </div>

        <h2 style={{ fontSize: '1rem' }}>Historial</h2>
        {data.records.length === 0 && <Empty>Sin registros de asistencia.</Empty>}
        {data.records.map((r, i) => {
          const tag = STATUS_TAG[r.status] || {};
          return (
            <div className="card" key={i}>
              <div className="row">
                <strong>{r.date ? new Date(r.date).toLocaleDateString('es-CO') : '—'}</strong>
                <span className={`status-btn ${tag.cls} active`} style={{ flex: 'none', padding: '4px 12px', minHeight: 0 }}>
                  {tag.label}
                </span>
              </div>
              <div className="muted">
                {r.group} · {r.type === 'REPOSICION' ? 'reposición' : 'regular'}
                {r.justification ? ` · ${r.justification}` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
