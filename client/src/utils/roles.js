// Display names for roles. PHYSICAL_TRAINER acts as the school's Coordinador —
// the enum value in the database stays unchanged; only the label differs.
export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  DEVELOPER: 'Desarrollador',
  ADMIN: 'Administrador',
  PHYSICAL_TRAINER: 'Coordinador',
  TEACHER: 'Profesor',
  ASSISTANT: 'Asistente',
  RECEPTION: 'Recepción',
  READ_ONLY: 'Solo lectura',
  PARENT: 'Estudiante / Acudiente',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}
