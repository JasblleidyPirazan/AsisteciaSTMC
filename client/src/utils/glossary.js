// Vocabulario único del paquete de clases: los mismos textos en tooltips,
// leyendas y portal de padres. Las cifras vienen del ledger del servidor
// (services/studentLedger.js); aquí solo se nombran.
export const GLOSSARY = {
  pagadas: 'Clases adquiridas más las pendientes del semestre anterior.',
  vistas: 'Presentes + ausentes + reposiciones vistas. Lo que consume el paquete (la falta sin justificar consume la clase).',
  faltan: 'Pagadas menos vistas. Se reparte en cuatro partes que suman exactamente lo que falta.',
  calendario: 'Clases que el calendario regular todavía le da al estudiante antes del cierre del semestre.',
  agendadas: 'Reposiciones ya programadas para el estudiante.',
  porAgendar: 'Reposición que la Escuela debe ofrecer (lluvia, cancelación de la Escuela o justificada) y aún no está agendada.',
  deficit: 'Lo que ni el calendario restante ni las reposiciones agendadas o por agendar cubren.',
  reposicion: 'Clase extra que la Escuela programa por justificada, lluvia o cancelación de la Escuela.',
  reprogramacion: 'Clase que el calendario regular devuelve por festivo o receso: no se repone, el calendario se corre.',
  sinConsolidar: 'Clase dictada cuyo reporte aún no coincide entre profesor y coordinador.',
  excedente: 'Clases vistas por encima de las pagadas.',
};

export const SEMAFORO = {
  VERDE: { label: 'Al día', color: 'var(--green)', badge: 'badge-green', help: 'Nada que hacer: el calendario y la agenda lo llevan a la meta.' },
  AMBAR: { label: 'Por agendar', color: 'var(--yellow)', badge: 'badge-yellow', help: 'Hay reposiciones por agendar o reportes por cerrar.' },
  ROJO: { label: 'Intervenir', color: 'var(--red)', badge: 'badge-red', help: 'Déficit, reportes sin cerrar (3 o más) o sin paquete registrado.' },
  GRIS: { label: 'Fuera de gestión', color: 'var(--gray-400)', badge: 'badge-gray', help: 'Graduado, de prueba, suspendido o inactivo.' },
};
