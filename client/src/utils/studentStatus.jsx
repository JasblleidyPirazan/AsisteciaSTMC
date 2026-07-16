// Estados de estudiante (derivados en el servidor: services/studentStatus.js).
// Ícono + etiqueta + color únicos para TODO el sistema: siempre que se muestre
// el nombre de un estudiante debe ir acompañado de su ícono de estado.
//
//   ✅ MATRICULADO  pago completo (pagos >= valor de sus clases adquiridas)
//   🔵 INSCRITO     tiene alguna asistencia y/o algún pago
//   📝 PREINSCRITO  registrado, sin asistencia ni pagos
//   🧪 PRUEBA       ha ido a clases de prueba
//   ⏸️ SUSPENDIDO   suspensión temporal vigente
//   ⛔ INACTIVO     desactivado
//
// El error de datos "sin fecha de nacimiento" (no se puede saber la tarifa
// adulto/pequeño) se marca aparte con ⚠️ (missingBirthDate).

export const STUDENT_STATUS = {
  MATRICULADO: { icon: '✅', label: 'Matriculado', cls: 'badge-green' },
  INSCRITO: { icon: '🔵', label: 'Inscrito', cls: 'badge-blue' },
  PREINSCRITO: { icon: '📝', label: 'Preinscrito', cls: 'badge-gray' },
  PRUEBA: { icon: '🧪', label: 'Prueba', cls: 'badge-yellow' },
  SUSPENDIDO: { icon: '⏸️', label: 'Suspendido', cls: 'badge-yellow' },
  INACTIVO: { icon: '⛔', label: 'Inactivo', cls: 'badge-gray' },
};

export function statusMeta(status) {
  return STUDENT_STATUS[status] || null;
}

// Ícono compacto (para listas densas: rosters, malla, buscador).
export function StudentStatusIcon({ status, missingBirthDate }) {
  const meta = statusMeta(status);
  return (
    <>
      {meta && <span title={meta.label} aria-label={meta.label} style={{ marginRight: 2 }}>{meta.icon}</span>}
      {missingBirthDate && (
        <span title="Falta la fecha de nacimiento — no se puede calcular su tarifa" aria-label="Falta fecha de nacimiento" style={{ marginRight: 2 }}>⚠️</span>
      )}
    </>
  );
}

// Badge completo (ícono + texto) para fichas y listas principales.
export function StudentStatusBadge({ status, missingBirthDate, style }) {
  const meta = statusMeta(status);
  return (
    <>
      {meta && (
        <span className={`badge ${meta.cls}`} style={style}>{meta.icon} {meta.label}</span>
      )}
      {missingBirthDate && (
        <span className="badge badge-red" style={style}
          title="No se puede calcular su tarifa (adulto/pequeño) sin la fecha de nacimiento">
          ⚠️ Sin fecha de nac.
        </span>
      )}
    </>
  );
}

export function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}
