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
 * Build a compact group code: días + hora(HH) + cancha + inicial de nivel.
 * Ej: Lunes+Miércoles, 15:45, cancha 3, Verde → "LX153V"
 */
function buildGroupCode(group) {
  const days = DAY_LETTERS.filter(([k]) => group[k]).map(([, l]) => l).join('');
  const hh = (group.startTime || '').slice(0, 2);
  const court = group.court != null && group.court !== '' ? String(group.court) : '';
  const lvl = LEVEL_INITIAL[group.ballLevel] || '';
  return `${days}${hh}${court}${lvl}`;
}

/**
 * Generate a unique group code. If the base code already exists, append a
 * numeric suffix (LX153V2, LX153V3, ...). `excludeId` skips a group's own row
 * when regenerating on update.
 */
async function generateUniqueGroupCode(prisma, group, excludeId = null) {
  const base = buildGroupCode(group) || 'GRP';
  let candidate = base;
  let n = 1;
  // Loop until we find a code not used by another group
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.group.findUnique({ where: { code: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${base}${n}`;
  }
}

module.exports = { buildGroupCode, generateUniqueGroupCode };
