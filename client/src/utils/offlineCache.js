// Caché ligera en localStorage para que las pantallas clave (grupos del día y
// rosters de asistencia) sigan disponibles sin conexión. Se escribe cada vez
// que una carga en línea tiene éxito y se lee como respaldo cuando la red falla.

export function cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Cuota llena / modo privado: la caché es best-effort, no bloquea el flujo.
  }
}

export function cacheGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Claves versionadas por recurso.
export const CACHE_KEYS = {
  groups: 'stmc_groups',
  allStudents: 'stmc_all_students',
  roster: (groupId) => `stmc_roster_${groupId}`,
};
