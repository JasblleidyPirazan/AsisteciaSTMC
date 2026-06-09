function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

export default function CostSummary({ present, effectiveUnits, ratePerStudent, assistantRate, professorName }) {
  const profTotal = present * ratePerStudent * effectiveUnits;
  const assistantTotal = assistantRate ? assistantRate * effectiveUnits : null;

  return (
    <div className="cost-box mt-4">
      <h3 className="mb-2">Cálculo de pago</h3>
      <div className="cost-row">
        <span className="text-sm">Profesor {professorName && `(${professorName})`}</span>
        <span className="text-sm text-gray">{present} × {fmt(ratePerStudent)} × {effectiveUnits}</span>
      </div>
      <div className="cost-row">
        <span className="font-medium">Total profesor</span>
        <span className="cost-total">{fmt(profTotal)}</span>
      </div>
      {assistantTotal !== null && (
        <>
          <div className="divider" style={{ margin: '8px 0' }} />
          <div className="cost-row">
            <span className="text-sm">Asistente</span>
            <span className="text-sm text-gray">{fmt(assistantRate)} × {effectiveUnits}</span>
          </div>
          <div className="cost-row">
            <span className="font-medium">Total asistente</span>
            <span className="cost-total">{fmt(assistantTotal)}</span>
          </div>
        </>
      )}
    </div>
  );
}
