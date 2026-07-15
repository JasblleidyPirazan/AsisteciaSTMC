// Sistema de notificaciones "toast" global, sin contexto de React: cualquier
// módulo llama toast.success/error/info(mensaje) y el componente <Toaster/>
// (montado una vez en App) se suscribe y las muestra. Reemplaza los alert()
// bloqueantes por avisos no intrusivos.

let seq = 0;
const listeners = new Set();

function emit(type, message, opts = {}) {
  if (!message) return;
  const toast = {
    id: ++seq,
    type,               // 'success' | 'error' | 'info'
    message: String(message),
    duration: opts.duration ?? (type === 'error' ? 6000 : 3500),
  };
  listeners.forEach((fn) => fn(toast));
  return toast.id;
}

export function subscribeToasts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const toast = {
  success: (msg, opts) => emit('success', msg, opts),
  error: (msg, opts) => emit('error', msg, opts),
  info: (msg, opts) => emit('info', msg, opts),
};
