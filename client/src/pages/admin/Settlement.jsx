import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Banner, Empty, Header, Loading, money } from '../../components/ui.jsx';

function currentPeriod() {
  const d = new Date();
  const half = d.getUTCDate() <= 15 ? 1 : 2;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${half}`;
}

// HU-LIQ-01: liquidación quincenal de todos los profesores y asistentes.
export default function Settlement() {
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/settlements/${period}`).then(setData).catch((e) => setError(e.message));
  }, [period]);

  return (
    <>
      <Header title="Liquidación" back="/admin" />
      <div className="content">
        {error && <Banner>{error}</Banner>}
        <div className="field">
          <label>Quincena (YYYY-MM-N)</label>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>

        {!data ? <Loading /> : (
          <>
            <div className="card center">
              <div className="muted">Total a pagar — {period}</div>
              <div className="summary-total" style={{ fontSize: '1.8rem' }}>{money(data.grandTotal)}</div>
            </div>
            {data.people.length === 0 && <Empty>Sin registros en esta quincena.</Empty>}
            {data.people.map((p) => (
              <div className="card" key={p.payeeId}>
                <div className="row">
                  <strong>{p.name}</strong>
                  <span className="tag">{p.role}</span>
                </div>
                {p.breakdown.map((b) => (
                  <div className="summary-line" key={b.category}>
                    <span className="muted">{b.label} ({b.count})</span><span>{money(b.total)}</span>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 6 }}>
                  <span>Total</span><strong>{money(p.total)}</strong>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
