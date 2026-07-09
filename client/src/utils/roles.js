// Display names for roles. PHYSICAL_TRAINER acts as the school's Coordinador —
// the enum value in the database stays unchanged; only the label differs.
export const ROLE_LABELS = {
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
