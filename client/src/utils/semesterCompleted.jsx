import { useState, useEffect } from 'react';
import { api } from '../api/client';

// Estudiantes que ya completaron su paquete de clases del semestre
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
      title="Ya vio todas las clases de su paquete del semestre">
      🎓 Semestre completado
    </span>
  );
}
