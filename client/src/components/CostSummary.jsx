function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

// Mirrors getBracketRate() in server/src/services/costEngine.js
function getBracketRate(presentCount, rates) {
  if (presentCount <= 0) return 0;
  if (presentCount <= 2) return parseFloat(rates.rate_2_students || 30000);
  if (presentCount === 3) return parseFloat(rates.rate_3_students || 45000);
  if (presentCount === 4) return parseFloat(rates.rate_4_students || 60000);
  return parseFloat(rates.rate_5plus_students || 75000);
}

export default function CostSummary({ regularPresent, repositionPresent, effectiveUnits, rates, assistantRate, professorName }) {
  // Payment is based solely on the total number of students present, regardless
  // of whether they attend as a regular class or as a make-up (reposición).
  const presentCount = regularPresent + repositionPresent;
  const bracketRate = getBracketRate(presentCount, rates);
  const profTotal = bracketRate * effectiveUnits;
  const assistantTotal = assistantRate ? assistantRate * effectiveUnits : null;

  return (
    <div className="cost-box mt-4">
      <h3 className="mb-2">Cálculo de pago</h3>
      <div className="cost-row">
        <span className="text-sm">Profesor {professorName && `(${professorName})`}</span>
        <span className="text-sm text-gray">
          {presentCount} est. → {fmt(bracketRate)} × {effectiveUnits}
        </span>
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
