// Quién puede reportar (asistencia / cancelación) cada tipo de sesión. Una sola
// función para clases regulares, reposiciones y festivales — antes eran tres
// guards distintos (canReportGroup, canReportMakeup, canReportFestival) y no
// coincidían: SUPERADMIN recibía 403 al reportar o cancelar una reposición.
//
//   SUPERADMIN        siempre
//   PHYSICAL_TRAINER  siempre (Coordinador)
//   ADMIN             solo MAKEUP y FESTIVAL (en clases regulares es solo-lectura)
//   TEACHER           REGULAR: si es el titular del grupo
//                     MAKEUP:  si es el profesor asignado o el sustituto
//                     FESTIVAL: nunca (lo reporta el coordinador; nota 30)
//   cualquier otro    nunca (ASSISTANT acompaña por /sessions/:id/assist; PARENT no reporta)
const prisma = require('./prisma');

/**
 * @param {{ role: string }} user
 * @param {{ kind?: string, group?: { professorId?: string }, groupProfessorId?: string,
 *           makeupProfessorId?: string, substituteProfessorId?: string }} session
 *        `kind` por defecto 'REGULAR'. Para una clase regular que aún no existe basta
 *        `{ kind: 'REGULAR', groupProfessorId }`.
 * @param {string|null} [professorId]  id del Professor vinculado al usuario (ver professorIdOf)
 */
function canReport(user, session, professorId = null) {
  const role = user?.role;
  if (role === 'SUPERADMIN' || role === 'PHYSICAL_TRAINER') return true;

  const kind = session?.kind || 'REGULAR';
  if (role === 'ADMIN') return kind === 'MAKEUP' || kind === 'FESTIVAL';

  if (role === 'TEACHER') {
    if (!professorId) return false;
    if (kind === 'REGULAR') {
      const titular = session?.group?.professorId ?? session?.groupProfessorId;
      return !!titular && titular === professorId;
    }
    if (kind === 'MAKEUP') {
      return session?.makeupProfessorId === professorId || session?.substituteProfessorId === professorId;
    }
    return false;
  }
  return false;
}

// Id del Professor vinculado al usuario (solo se consulta para TEACHER).
async function professorIdOf(user) {
  if (user?.role !== 'TEACHER') return null;
  const professor = await prisma.professor.findUnique({ where: { userId: user.id } });
  return professor?.id || null;
}

module.exports = { canReport, professorIdOf };
