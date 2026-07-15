// Estado vacío que guía: en lugar de un simple "No hay datos", ofrece la acción
// siguiente (crear, limpiar filtros…). `action` = { label, onClick }.
export default function EmptyState({ icon = '📭', title, hint, action }) {
  return (
    <div className="empty-state">
      <div className="empty-ico">{icon}</div>
      <div className="empty-title">{title}</div>
      {hint && <div className="empty-hint">{hint}</div>}
      {action && (
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
