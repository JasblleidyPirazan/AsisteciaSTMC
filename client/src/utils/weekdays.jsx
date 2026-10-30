// Días que el estudiante toma en cada grupo (StudentEnrollment.weekdays).
// Números de getUTCDay(): 0 = domingo … 6 = sábado. null o lista vacía = todos
// los días del grupo (el servidor guarda una lista vacía para "todos").

export const WEEKDAY_FIELDS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
export const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Días (0–6) en que el grupo tiene clase, empezando por el lunes.
export function groupWeekdays(group) {
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => group?.[WEEKDAY_FIELDS[d]]);
}

// null (todos) o la lista de días elegidos, ordenada empezando por el lunes.
export function storedWeekdays(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => value.includes(d));
}

// "Lun · Vie" cuando toma solo algunos días; null cuando toma todos (nada que mostrar).
export function weekdaysLabel(value) {
  const days = storedWeekdays(value);
  return days ? days.map((d) => WEEKDAY_SHORT[d]).join(' · ') : null;
}

// Casillas por día del grupo. `value` null = todas marcadas; si se marcan todas
// vuelve a null. No deja desmarcar el último día (mínimo uno).
export function WeekdayPicker({ group, value, onChange, disabled }) {
  const available = groupWeekdays(group);
  if (available.length === 0) return null;
  const selected = storedWeekdays(value) || available;

  const toggle = (d) => {
    const next = selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d];
    if (next.length === 0) return;
    onChange(next.length === available.length ? null : available.filter((x) => next.includes(x)));
  };

  return (
    <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
      {available.map((d) => (
        <label key={d} className="flex items-center gap-1 text-sm" style={{ cursor: disabled ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={selected.includes(d)} disabled={disabled} onChange={() => toggle(d)} />
          {WEEKDAY_SHORT[d]}
        </label>
      ))}
    </div>
  );
}
