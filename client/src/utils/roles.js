// Display names for roles. PHYSICAL_TRAINER acts as the school's Coordinador —
// the enum value in the database stays unchanged; only the label differs.
export const ROLE_LABELS = {
  SUPERADMIN: 'Superadministrador',
  ADMIN: 'Administrador',
  TEACHER: 'Profesor',
  ASSISTANT: 'Asistente',
  PARENT: 'Acudiente',
  PHYSICAL_TRAINER: 'Coordinador',
  RECEPTION: 'Recepción',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

// "Profesor L" no es un rol de la base: es un TEACHER con `leadTeacher`. Además
// de todo lo del profesor, entra a las pantallas que listan la pseudo-rol
// TEACHER_L (Reposiciones y reprogramación, Agendar reposiciones).
export const TEACHER_L = 'TEACHER_L';
export const isLeadTeacher = (user) => user?.role === 'TEACHER' && !!user?.leadTeacher;

// Roles con los que se evalúan las puertas de la app (rol real + TEACHER_L)
export function userRoles(user) {
  if (!user) return [];
  return isLeadTeacher(user) ? [user.role, TEACHER_L] : [user.role];
}

// ¿Este usuario pasa una puerta que lista estos roles? SUPERADMIN pasa todas.
export function hasAnyRole(user, roles) {
  if (!user) return false;
  if (user.role === 'SUPERADMIN') return true;
  return userRoles(user).some((r) => roles.includes(r));
}

export function userRoleLabel(user) {
  return isLeadTeacher(user) ? 'Profesor L' : roleLabel(user?.role);
}
