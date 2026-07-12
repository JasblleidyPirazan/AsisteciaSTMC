import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Control de la validación de datos + aceptación de políticas por el acudiente.
export default function ValidationAdminPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL | DONE | PENDING
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const link = `${window.location.origin}/validar`;

  useEffect(() => {
    api.get('/validation/status').then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function copyLink() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const visible = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.students.filter((s) => {
      if (filter === 'DONE' && !s.validatedAt) return false;
      if (filter === 'PENDING' && s.validatedAt) return false;
      if (q && !s.name.toLowerCase().includes(q) && !String(s.document).includes(q)) return false;
      return true;
    });
  }, [data, filter, search]);

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page page-wide">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <div style={{ flex: 1 }}>
          <h1>Validación de datos</h1>
          <p className="text-xs text-gray">Confirmación de datos + aceptación de políticas por el acudiente</p>
        </div>
      </div>

      <div className="page-content">
        {/* Link para compartir */}
        <div className="card mb-3">
          <div className="text-sm font-medium mb-1">Enlace para el acudiente / estudiante</div>
          <div className="text-xs text-gray mb-2">
            Comparte este enlace. Cada persona entra con el <strong>documento del estudiante</strong>,
            revisa sus datos, los corrige y acepta las políticas.
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <input className="form-input" readOnly value={link} style={{ flex: 1, minWidth: 200 }}
              onFocus={(e) => e.target.select()} />
            <button className="btn btn-primary" onClick={copyLink}>{copied ? '✓ Copiado' : 'Copiar'}</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="home-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <div className="card"><div className="kpi-lbl">Total</div><div className="kpi-num">{data.total}</div></div>
          <div className="card"><div className="kpi-lbl">Validados</div><div className="kpi-num" style={{ color: 'var(--green)' }}>{data.validated}</div></div>
          <div className="card"><div className="kpi-lbl">Pendientes</div><div className="kpi-num" style={{ color: 'var(--yellow)' }}>{data.pending}</div></div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 mb-3 mt-3" style={{ flexWrap: 'wrap' }}>
          {[['ALL', 'Todos'], ['DONE', 'Validados'], ['PENDING', 'Pendientes']].map(([k, l]) => (
            <button key={k} className={`btn ${filter === k ? 'btn-primary' : 'btn-outline'}`}
              style={{ minHeight: 34, padding: '0 12px', fontSize: '0.8rem' }}
              onClick={() => setFilter(k)}>{l}</button>
          ))}
          <input className="form-input" placeholder="🔎 Buscar…" value={search}
            onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160, minHeight: 34 }} />
        </div>

        {visible.length === 0 ? (
          <div className="alert alert-info">No hay estudiantes para este filtro.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Estudiante</th><th>Documento</th><th>Grupo</th><th>Estado</th><th>Fecha</th></tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td>{s.document || '—'}</td>
                    <td>{s.group || '—'}</td>
                    <td>
                      {s.validatedAt
                        ? <span className="badge badge-green">✓ Validado</span>
                        : <span className="badge badge-yellow">Pendiente</span>}
                    </td>
                    <td className="text-gray">{s.validatedAt ? fmtDateTime(s.validatedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
