import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

export function Header({ title, back }) {
  const navigate = useNavigate();
  return (
    <header className="app-header">
      {back && <button className="back" onClick={() => navigate(back === true ? -1 : back)}>←</button>}
      <h1>{title}</h1>
    </header>
  );
}

export function Loading({ message = 'Cargando…' }) {
  return (
    <div className="loading">
      <div className="center">
        <div className="spinner" />
        <p className="muted" style={{ marginTop: 12 }}>{message}</p>
      </div>
    </div>
  );
}

export function Banner({ type = 'error', children }) {
  return <div className={`banner banner-${type}`}>{children}</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

// Detecta el estado de conexión para el modo offline (HU-AST-07).
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export const money = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
