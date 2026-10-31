import { GLOSSARY, SEMAFORO } from '../utils/glossary';

const n = (v) => Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 });

// Ecuación única del paquete: Pagadas · Vistas · Faltan, y los cuatro sumandos de
// "Faltan". Todo viene del ledger; nada se recalcula aquí.
export default function StudentLedgerCard({ ledger, compact = false, onSinConsolidar }) {
  if (!ledger) return null;
  const { paquete, consumidas, pendientes, sinConsolidar, semaforo } = ledger;
  const sem = SEMAFORO[semaforo] || SEMAFORO.GRIS;
  if (!paquete.total) {
    return <div className="text-xs" style={{ color: 'var(--red)' }}>Sin paquete registrado</div>;
  }
  const pct = Math.min(100, Math.round((consumidas.total / paquete.total) * 100));
  const chips = [
    ['Calendario cubre', pendientes.cubreCalendario, 'calendario', 'var(--green)'],
    ['Agendadas', pendientes.agendadasAplicadas, 'agendadas', 'var(--gray-600)'],
    ['Por agendar', pendientes.porAgendar, 'porAgendar', 'var(--yellow)'],
    ['Déficit', pendientes.deficit, 'deficit', 'var(--red)'],
  ];

  return (
    <div>
      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
        <span className={`badge ${sem.badge}`} title={sem.help}>{sem.label}</span>
        <span className="text-sm" title={GLOSSARY.pagadas}>Pagadas <strong>{n(paquete.total)}</strong></span>
        <span className="text-sm" title={GLOSSARY.vistas}>· Vistas <strong>{n(consumidas.total)}</strong></span>
        <span className="text-sm" title={GLOSSARY.faltan}>· Faltan <strong>{n(pendientes.total)}</strong></span>
        {consumidas.excedente > 0 && (
          <span className="badge badge-blue" title={GLOSSARY.excedente}>+{n(consumidas.excedente)} de más</span>
        )}
      </div>
      <div className="load-bar mt-1" style={{ maxWidth: 360 }}>
        <span style={{ width: `${pct}%`, background: sem.color }} />
      </div>
      {!compact && pendientes.total > 0 && (
        <div className="flex gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
          {chips.map(([label, value, key, color]) => (
            <span key={key} className="text-xs" title={GLOSSARY[key]} style={{ color }}>
              {label} <strong>{n(value)}</strong>
            </span>
          ))}
        </div>
      )}
      {sinConsolidar?.clases > 0 && (
        <div className="text-xs mt-1" style={{ color: 'var(--yellow)' }} title={GLOSSARY.sinConsolidar}>
          ⚠ {sinConsolidar.clases} {sinConsolidar.clases === 1 ? 'clase' : 'clases'} sin consolidar
          {onSinConsolidar && <> · <button className="link-name" onClick={onSinConsolidar}>ver reportes ›</button></>}
        </div>
      )}
    </div>
  );
}
