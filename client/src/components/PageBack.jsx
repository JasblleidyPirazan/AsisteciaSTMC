import { useNavigate, useLocation } from 'react-router-dom';

// Botón "volver" contextual. Si se llegó a la página desde otra vista (que pasó
// `state.from = { label, to }` al navegar), muestra "‹ Etiqueta" y regresa a
// ese paso; si no, la flecha normal hacia el destino por defecto (fallback).
export default function PageBack({ fallback = '/admin' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;

  if (from?.to) {
    return (
      <button className="nav-back nav-back-ctx" title={`Volver a ${from.label}`}
        onClick={() => navigate(from.to)}>
        ‹ {from.label}
      </button>
    );
  }
  return <button className="nav-back" onClick={() => navigate(fallback)}>←</button>;
}
