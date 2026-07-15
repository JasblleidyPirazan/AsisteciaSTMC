import { useState, useEffect, useCallback } from 'react';
import { subscribeToasts } from '../utils/toast';

const ICON = { success: '✓', error: '⚠', info: 'ⓘ' };

// Renderiza la pila de toasts (arriba a la derecha). Se monta una sola vez en
// App; escucha el pub/sub de utils/toast y auto-descarta cada aviso.
export default function Toaster() {
  const [items, setItems] = useState([]);

  const remove = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);

  useEffect(() => {
    return subscribeToasts((t) => {
      setItems((list) => [...list, t]);
      setTimeout(() => remove(t.id), t.duration);
    });
  }, [remove]);

  if (items.length === 0) return null;

  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status" onClick={() => remove(t.id)}>
          <span className="toast-ico">{ICON[t.type] || 'ⓘ'}</span>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
