/**
 * Matriz de accesos configurable (RBAC).
 *
 * La matriz vive en SystemConfig['permission_matrix'] como JSON:
 *   { [ROLE]: { [moduleKey]: { view: bool, edit: bool } } }
 * Se hace merge con DEFAULT_MATRIX, así que cualquier rol/módulo faltante cae
 * al default. SUPER_ADMIN y DEVELOPER siempre tienen acceso total (no se pueden
 * autobloquear). La matriz responde "¿el rol X puede tocar el módulo Y?"; el
 * scoping por propiedad (canReportGroup, PARENT solo su hijo, etc.) es una capa
 * aparte que se conserva en cada ruta.
 */
const prisma = require('../lib/prisma');

const MATRIX_KEY = 'permission_matrix';

// Registro canónico de módulos. `edit:false` → el módulo es solo lectura.
const MODULES = [
  { key: 'tablero', label: 'Tablero', edit: false },
  { key: 'estudiantes', label: 'Estudiantes', edit: true },
  { key: 'grupos', label: 'Grupos', edit: true },
  { key: 'horarios', label: 'Horarios', edit: true },
  { key: 'pasar_lista', label: 'Pasar lista', edit: true },
  { key: 'asistencia', label: 'Asistencia', edit: false },
  { key: 'revisiones', label: 'Revisiones', edit: true },
  { key: 'reposiciones', label: 'Reposiciones', edit: true },
  { key: 'festivales', label: 'Festivales', edit: true },
  { key: 'nomina', label: 'Nómina', edit: true },
  { key: 'informes', label: 'Informes', edit: false },
  { key: 'configuracion', label: 'Configuración', edit: true },
  { key: 'roles_accesos', label: 'Roles y accesos', edit: true },
  { key: 'auditoria', label: 'Auditoría', edit: false },
];
const MODULE_KEYS = MODULES.map((m) => m.key);

const ROLES = ['SUPER_ADMIN', 'DEVELOPER', 'ADMIN', 'PHYSICAL_TRAINER', 'TEACHER', 'ASSISTANT', 'RECEPTION', 'READ_ONLY', 'PARENT'];
const FULL_ACCESS_ROLES = ['SUPER_ADMIN', 'DEVELOPER'];

// Helpers para construir la matriz por defecto.
function all(view, edit) {
  const row = {};
  for (const m of MODULES) row[m.key] = { view, edit: m.edit ? edit : false };
  return row;
}
function row(spec) {
  // spec: { moduleKey: [view, edit] }, resto en false
  const r = {};
  for (const m of MODULES) {
    const s = spec[m.key];
    r[m.key] = { view: !!(s && s[0]), edit: !!(m.edit && s && s[1]) };
  }
  return r;
}

// Defaults derivados de los accesos actuales del sistema.
const DEFAULT_MATRIX = {
  SUPER_ADMIN: all(true, true),
  DEVELOPER: all(true, true),
  ADMIN: all(true, true),
  READ_ONLY: all(true, false),
  PHYSICAL_TRAINER: row({
    tablero: [true, false], estudiantes: [true, true], grupos: [true, true],
    horarios: [true, false], pasar_lista: [true, true], asistencia: [true, false],
    revisiones: [true, true], reposiciones: [true, true], festivales: [true, true],
    informes: [true, false], auditoria: [true, false],
  }),
  TEACHER: row({
    pasar_lista: [true, true], asistencia: [true, false], reposiciones: [true, true],
    festivales: [true, true], nomina: [true, false],
  }),
  ASSISTANT: row({
    pasar_lista: [true, true], nomina: [true, false],
  }),
  RECEPTION: row({
    estudiantes: [true, false], // el pago lo maneja un permiso específico
  }),
  PARENT: row({
    tablero: [true, false], asistencia: [true, false], pasar_lista: [true, true],
  }),
};

let cache = null;

function deepMerge(base, override) {
  const out = {};
  for (const role of ROLES) {
    out[role] = {};
    for (const m of MODULE_KEYS) {
      const b = base[role]?.[m] || { view: false, edit: false };
      const o = override?.[role]?.[m];
      out[role][m] = {
        view: o && typeof o.view === 'boolean' ? o.view : b.view,
        edit: o && typeof o.edit === 'boolean' ? o.edit : b.edit,
      };
    }
  }
  return out;
}

async function getMatrix() {
  if (cache) return cache;
  let stored = null;
  try {
    const rec = await prisma.systemConfig.findUnique({ where: { key: MATRIX_KEY } });
    if (rec?.value) stored = JSON.parse(rec.value);
  } catch { /* si falla, usamos defaults */ }
  cache = deepMerge(DEFAULT_MATRIX, stored);
  return cache;
}

function invalidate() { cache = null; }

async function setMatrix(next, userId) {
  const merged = deepMerge(DEFAULT_MATRIX, next);
  // Guardrail anti-lockout: SUPER_ADMIN/DEVELOPER/ADMIN nunca pierden roles_accesos
  for (const r of ['SUPER_ADMIN', 'DEVELOPER', 'ADMIN']) {
    merged[r].roles_accesos = { view: true, edit: true };
  }
  await prisma.systemConfig.upsert({
    where: { key: MATRIX_KEY },
    create: { key: MATRIX_KEY, value: JSON.stringify(merged), updatedBy: userId || null },
    update: { value: JSON.stringify(merged), updatedBy: userId || null },
  });
  invalidate();
  return merged;
}

/** ¿El rol puede `view`/`edit` el módulo? SUPER_ADMIN/DEVELOPER siempre sí. */
async function can(role, moduleKey, action = 'view') {
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  const matrix = await getMatrix();
  const cell = matrix[role]?.[moduleKey];
  if (!cell) return false;
  return action === 'edit' ? !!cell.edit : !!cell.view;
}

module.exports = {
  MODULES, MODULE_KEYS, ROLES, DEFAULT_MATRIX,
  getMatrix, setMatrix, can, invalidate, MATRIX_KEY,
};
