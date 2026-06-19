import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Banner, Header, Loading, money } from '../components/ui.jsx';
import { downloadCSV } from '../utils/export.js';

// Quincena actual en formato YYYY-MM-N.
function currentPeriod() {
  const d = new Date();
  const half = d.getUTCDate() <= 15 ? 1 : 2;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${half}`;
}

// HU-LIQ-02: ver mi propia liquidación.
export default function MySettlement() {
  const [period] = useState(currentPeriod());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/settlements/me/${period}`).then(setData).catch((e) => setError(e.message));
  }, [period]);

  if (error) return <div className="content"><Banner>{error}</Banner></div>;
  if (!data) return <Loading message="Calculando liquidación…" />;

  return (
    <>
      <Header title="Mi liquidación" back="/" />
      <div className="content">
        <div className="card center">
          <div className="muted">Quincena {period}</div>
          <div className="summary-total" style={{ fontSize: '2rem' }}>{money(data.total)}</div>
        </div>

        <h2 style={{ fontSize: '1rem' }}>Desglose</h2>
        <div className="card">
          {data.breakdown.length === 0 && <p className="muted">Sin registros en esta quincena.</p>}
          {data.breakdown.map((b) => (
            <div className="summary-line" key={b.category}>
              <span>{b.label} ({b.count})</span><strong>{money(b.total)}</strong>
            </div>
          ))}
        </div>

        {data.sessions.length > 0 && (
          <button
            className="btn btn-outline"
            onClick={() => downloadCSV(
              `mi_liquidacion_${period}.csv`,
              ['Fecha', 'Grupo', 'Categoría', 'Presentes', 'Unidades', 'Tarifa', 'Total'],
              data.sessions.map((s) => [
                s.date ? new Date(s.date).toLocaleDateString('es-CO') : '',
                s.group, s.category, s.presentCount, s.units, s.rate, s.total,
              ]),
            )}
          >⬇️ Exportar a Excel/CSV</button>
        )}

        <h2 style={{ fontSize: '1rem' }}>Sesiones</h2>
        {data.sessions.map((s, i) => (
          <div className="card" key={i}>
            <div className="row">
              <strong>{s.date ? new Date(s.date).toLocaleDateString('es-CO') : '—'}</strong>
              <span>{money(s.total)}</span>
            </div>
            <div className="muted">{s.group} · {s.category} · {s.presentCount} pres. × {s.units}u</div>
          </div>
        ))}
      </div>
    </>
  );
}
