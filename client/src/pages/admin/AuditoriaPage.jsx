import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TYPE_COLOR = {
  'Edición de reporte': 'var(--warning)',
  'Cambio de grupo': 'var(--blue)',
  'Aprobación de nómina': 'var(--green)',
};

export default function AuditoriaPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get('/audit').then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div className="page page-wide">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Auditoría</h1>
      </div>
      <div className="page-content">
        <p className="text-sm text-gray mb-3">
          Registro de cambios del sistema: ediciones de reportes de asistencia, cambios de grupo de
          estudiantes y aprobaciones de nómina.
        </p>
        {items === null ? <div className="spinner" /> : items.length === 0 ? (
          <div className="alert alert-info">Sin actividad registrada.</div>
        ) : (
          <div className="card">
            {items.map((it, i) => (
              <div key={i} className="home-list-row">
                <span className="legend-dot" style={{ background: TYPE_COLOR[it.type] || 'var(--gray-400)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="font-medium text-sm">{it.icon} {it.type}</div>
                  <div className="text-xs text-gray">{it.detail}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="text-xs text-gray">{fmtDateTime(it.at)}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{it.actor}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
