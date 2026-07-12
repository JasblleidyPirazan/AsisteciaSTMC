// Utilidades de quincenas (períodos de liquidación).
//
// El período se guarda como "YYYY-MM-h" (h = 1 → días 1–15, h = 2 → 16–fin).
// Esos cortes NO cambian. Lo que cambia es la ETIQUETA: las quincenas se
// numeran de forma correlativa desde la quincena en que arranca el semestre
// activo (la 1ª quincena del semestre = "Quincena 1", la siguiente = 2, …).

export function getCurrentPeriod() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const half = now.getDate() <= 15 ? '1' : '2';
  return `${y}-${m}-${half}`;
}

// Últimas ~8 quincenas (de la próxima hacia atrás 6 meses), sin duplicados.
export function buildPeriodOptions() {
  const options = [];
  const now = new Date();
  for (let i = -1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    options.push(`${y}-${m}-1`);
    options.push(`${y}-${m}-2`);
  }
  return [...new Set(options)];
}

// Índice absoluto de una quincena: cada mes tiene 2, contadas desde el año 0.
function halfIndex(period) {
  const [y, m, h] = String(period).split('-').map(Number);
  return y * 24 + (m - 1) * 2 + (h - 1);
}

function periodForDate(dateLike) {
  const d = new Date(dateLike);
  // La fecha viene como Date @db.Date (medianoche UTC); usamos UTC para no
  // correr un día por zona horaria.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const half = d.getUTCDate() <= 15 ? '1' : '2';
  return `${y}-${m}-${half}`;
}

// Número correlativo de quincena dentro del semestre (1, 2, 3, …) o null si el
// período cae antes del inicio del semestre (o no hay semestre).
export function quincenaNumber(period, semesterStart) {
  if (!semesterStart) return null;
  const n = halfIndex(period) - halfIndex(periodForDate(semesterStart)) + 1;
  return n >= 1 ? n : null;
}

// Etiqueta de mes/mitad de un período: "2025-06 · 2ª".
function calendarLabel(period) {
  const [y, m, h] = String(period).split('-');
  return `${y}-${m} · ${h === '1' ? '1ª' : '2ª'}`;
}

// Etiqueta completa para selectores/encabezados. Con semestre activo:
// "Quincena 3 (2025-07 · 1ª)"; sin numeración: "2025-06 · 2ª quincena".
export function periodLabel(period, semester) {
  const n = quincenaNumber(period, semester?.startDate);
  if (n) return `Quincena ${n} (${calendarLabel(period)})`;
  return `${calendarLabel(period)} quincena`;
}

// Etiqueta corta ("Quincena 3" o, sin semestre, "2025-07 · 1ª").
export function quincenaShort(period, semester) {
  const n = quincenaNumber(period, semester?.startDate);
  return n ? `Quincena ${n}` : calendarLabel(period);
}
