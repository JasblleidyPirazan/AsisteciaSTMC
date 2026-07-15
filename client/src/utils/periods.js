// Utilidades de quincenas (períodos de liquidación).
//
// El período se guarda como "YYYY-MM-h" (h = 1 → días 1–15, h = 2 → 16–fin).
// Las quincenas se numeran de forma correlativa desde la quincena en que arranca
// el semestre activo. El selector muestra EXACTAMENTE las quincenas del semestre
// (de su fecha de inicio a su fecha de fin), no los últimos meses del calendario.

// "Hoy" en la hora de Bogotá (independiente de la zona del dispositivo).
const BOGOTA_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});
function bogotaParts() {
  const p = BOGOTA_FMT.formatToParts(new Date());
  const get = (t) => Number(p.find((x) => x.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function periodStr(y, m, half) {
  return `${y}-${String(m).padStart(2, '0')}-${half}`;
}

export function getCurrentPeriod() {
  const { y, m, d } = bogotaParts();
  return periodStr(y, m, d <= 15 ? 1 : 2);
}

// Índice absoluto de una quincena: cada mes tiene 2, contadas desde el año 0.
function halfIndex(period) {
  const [y, m, h] = String(period).split('-').map(Number);
  return y * 24 + (m - 1) * 2 + (h - 1);
}

// La quincena (año, mes, mitad) en que cae una fecha @db.Date (UTC).
function periodPartsForDate(dateLike) {
  const d = new Date(dateLike);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, half: d.getUTCDate() <= 15 ? 1 : 2 };
}
function periodForDate(dateLike) {
  const { y, m, half } = periodPartsForDate(dateLike);
  return periodStr(y, m, half);
}

function nextHalf(y, m, half) {
  if (half === 1) return [y, m, 2];
  if (m === 12) return [y + 1, 1, 1];
  return [y, m + 1, 1];
}

// Todas las quincenas del semestre, en orden (Quincena 1 → última), inclusivas
// de la quincena que contiene la fecha de inicio y la que contiene la de fin.
export function semesterPeriods(semester) {
  if (!semester?.startDate || !semester?.endDate) return null;
  let { y, m, half } = periodPartsForDate(semester.startDate);
  const endIdx = halfIndex(periodForDate(semester.endDate));
  const out = [];
  while (halfIndex(periodStr(y, m, half)) <= endIdx && out.length < 60) {
    out.push(periodStr(y, m, half));
    [y, m, half] = nextHalf(y, m, half);
  }
  return out;
}

// Respaldo sin semestre activo: la quincena actual y las 11 anteriores.
function legacyOptions() {
  const { y, m } = bogotaParts();
  const out = [];
  for (let i = 0; i < 12; i++) {
    const mm = m - i;
    const yy = y + Math.floor((mm - 1) / 12);
    const norm = ((mm - 1) % 12 + 12) % 12 + 1;
    out.push(periodStr(yy, norm, 2), periodStr(yy, norm, 1));
  }
  return [...new Set(out)].sort((a, b) => halfIndex(a) - halfIndex(b));
}

// Opciones del selector. Con semestre activo → sus quincenas; si el período
// `ensure` (normalmente el seleccionado/actual) no cae dentro, se agrega para
// que el selector nunca quede en blanco.
export function buildPeriodOptions(semester, ensure) {
  let list = semesterPeriods(semester) || legacyOptions();
  if (ensure && !list.includes(ensure)) {
    list = [...list, ensure].sort((a, b) => halfIndex(a) - halfIndex(b));
  }
  return list;
}

// Número correlativo de quincena dentro del semestre (1, 2, …) o null si el
// período cae antes del inicio del semestre (o no hay semestre).
export function quincenaNumber(period, semesterStart) {
  if (!semesterStart) return null;
  const n = halfIndex(period) - halfIndex(periodForDate(semesterStart)) + 1;
  return n >= 1 ? n : null;
}

function calendarLabel(period) {
  const [y, m, h] = String(period).split('-');
  return `${y}-${m} · ${h === '1' ? '1ª' : '2ª'}`;
}

// "Quincena 3 (2026-08 · 1ª)"; sin numeración: "2026-06 · 2ª quincena".
export function periodLabel(period, semester) {
  const n = quincenaNumber(period, semester?.startDate);
  if (n) return `Quincena ${n} (${calendarLabel(period)})`;
  return `${calendarLabel(period)} quincena`;
}

export function quincenaShort(period, semester) {
  const n = quincenaNumber(period, semester?.startDate);
  return n ? `Quincena ${n}` : calendarLabel(period);
}

// Rango de fechas [from, to] (YYYY-MM-DD) que cubre una quincena "YYYY-MM-h":
// h=1 → días 1–15, h=2 → 16 al último día del mes.
export function periodRange(period) {
  const [y, m, h] = String(period).split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const from = `${y}-${mm}-${h === 1 ? '01' : '16'}`;
  const lastDay = h === 1 ? 15 : new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${mm}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}
