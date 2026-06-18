import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Banner, Header, Loading, money } from '../../components/ui.jsx';
import { downloadCSV, printView } from '../../utils/export.js';

function currentPeriod() {
  const d = new Date();
  const half = d.getUTCDate() <= 15 ? 1 : 2;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${half}`;
}

// HU-ADM-02: reportes globales consolidados.
export default function Reports() {
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/admin/reports/${period}`).then(setData).catch((e) => setError(e.message));
  }, [period]);

  return (
    <>
      <Header title="Reportes" back="/admin" />
      <div className="content">
        {error && <Banner>{error}</Banner>}
        <div className="field">
          <label>Quincena (YYYY-MM-N)</label>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        {!data ? <Loading /> : (
          <>
            <div className="card">
              <div className="summary-line"><span>Clases realizadas</span><strong>{data.metrics.classesRealized}</strong></div>
              <div className="summary-line"><span>Clases canceladas</span><strong>{data.metrics.classesCancelled}</strong></div>
              <div className="summary-line"><span>Tasa de asistencia</span><strong>{data.metrics.attendanceRate}%</strong></div>
              <div className="row" style={{ marginTop: 8 }}>
                <span>Total a pagar</span><span className="summary-total">{money(data.metrics.totalToPay)}</span>
              </div>
            </div>
            <div className="btn-group">
              <button className="btn btn-outline" onClick={() => downloadCSV(
                `reporte_${period}.csv`,
                ['Métrica', 'Valor'],
                [
                  ['Clases realizadas', data.metrics.classesRealized],
                  ['Clases canceladas', data.metrics.classesCancelled],
                  ['Tasa de asistencia (%)', data.metrics.attendanceRate],
                  ['Total a pagar', data.metrics.totalToPay],
                ],
              )}>⬇️ Excel/CSV</button>
              <button className="btn btn-outline" onClick={printView}>🖨️ PDF</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
