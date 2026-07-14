// Orden alfanumérico natural para códigos de grupo: "G2" antes que "G10",
// ignorando mayúsculas/acentos. Prisma solo ordena lexicográficamente, así que
// los listados que alimentan desplegables se ordenan en JS con este comparador.
function compareCodes(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' });
}

const byGroupCode = (a, b) => compareCodes(a.code, b.code);

module.exports = { compareCodes, byGroupCode };
