import { useState, useEffect } from 'react';
import { api } from '../api/client';

// Estudiantes 🎓 graduados: ya consumieron su paquete de clases del semestre
// (vistas + faltas)
// (derivado en el servidor: GET /alerts/semester-completed). Devuelve un Set de ids.
export function useSemesterCompleted() {
  const [ids, setIds] = useState(() => new Set());
  useEffect(() => {
    api.get('/alerts/semester-completed')
      .then((d) => setIds(new Set(d?.studentIds || [])))
      .catch(() => {});
  }, []);
  return ids;
}

export function SemesterCompletedBadge({ style }) {
  return (
    <span className="badge badge-green" style={style}
      title="Ya consumió todas las clases de su paquete del semestre (vistas + faltas)">
      🎓 Graduado
    </span>
  );
}
