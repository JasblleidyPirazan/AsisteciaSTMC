const DAY_LETTERS = [
  ['lunes', 'L'],
  ['martes', 'M'],
  ['miercoles', 'X'],
  ['jueves', 'J'],
  ['viernes', 'V'],
  ['sabado', 'S'],
  ['domingo', 'D'],
];

const LEVEL_INITIAL = { Verde: 'V', Amarilla: 'A', Naranja: 'N', Roja: 'R' };

/**
 * Vista previa del código automático del grupo (el backend es la fuente de
 * verdad y resuelve colisiones con un sufijo numérico).
 * Ej: Lunes+Miércoles, 15:45, cancha 3, Verde → "LX153V"
 */
export function buildGroupCode(group) {
  const days = DAY_LETTERS.filter(([k]) => group[k]).map(([, l]) => l).join('');
  const hh = (group.startTime || '').slice(0, 2);
  const court = group.court !== undefined && group.court !== null && group.court !== ''
    ? String(group.court) : '';
  const lvl = LEVEL_INITIAL[group.ballLevel] || '';
  return `${days}${hh}${court}${lvl}`;
}
