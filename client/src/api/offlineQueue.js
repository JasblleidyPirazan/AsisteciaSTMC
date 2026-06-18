// Cola de sincronización offline (HU-AST-07). Si no hay conexión, los reportes
// de asistencia se guardan en localStorage y se reenvían al recuperar señal.
import { api } from './client.js';

const QUEUE_KEY = 'tenis_pending_submits';

const read = () => JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
const write = (q) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));

export function queueSubmit(payload) {
  const q = read();
  q.push({ id: crypto.randomUUID(), payload, at: Date.now() });
  write(q);
}

export function pendingCount() {
  return read().length;
}

// Reenvía todos los reportes pendientes. Devuelve cuántos se sincronizaron.
export async function flushQueue() {
  let q = read();
  let synced = 0;
  for (const item of [...q]) {
    try {
      await api.post('/sessions/submit', item.payload);
      q = q.filter((x) => x.id !== item.id);
      write(q);
      synced += 1;
    } catch (err) {
      // Si es un error de validación/conflicto (no de red), descartamos el item
      // para no bloquear la cola; si es de red, se reintenta luego.
      if (err.status && err.status !== 0) {
        q = q.filter((x) => x.id !== item.id);
        write(q);
      } else {
        break;
      }
    }
  }
  return synced;
}

// Cache simple del contexto de la sesión para uso offline.
export const sessionCache = {
  key: (groupId, date) => `tenis_ctx_${groupId}_${date}`,
  set(groupId, date, data) {
    try { localStorage.setItem(this.key(groupId, date), JSON.stringify(data)); } catch { /* ignore */ }
  },
  get(groupId, date) {
    const raw = localStorage.getItem(this.key(groupId, date));
    return raw ? JSON.parse(raw) : null;
  },
};
