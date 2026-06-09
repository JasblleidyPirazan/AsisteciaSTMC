import { useState, useEffect } from 'react';

const PENDING_KEY = 'stmc_pending_sessions';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      syncPending();
    };
    const onOffline = () => setIsOffline(true);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOffline;
}

export function savePendingSession(data) {
  const pending = getPendingSessions();
  pending.push({ ...data, savedAt: new Date().toISOString() });
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function getPendingSessions() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearPendingSessions() {
  localStorage.removeItem(PENDING_KEY);
}

async function syncPending() {
  const pending = getPendingSessions();
  if (pending.length === 0) return;

  const { api } = await import('../api/client');
  const synced = [];

  for (const item of pending) {
    try {
      await api.post(`/sessions/${item.sessionId}/finalize`, item.payload);
      synced.push(item);
    } catch {
      // Keep failed items for next sync
    }
  }

  if (synced.length > 0) {
    const remaining = getPendingSessions().filter(
      (p) => !synced.find((s) => s.savedAt === p.savedAt)
    );
    localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
    console.log(`Sincronizados ${synced.length} registros pendientes`);
  }
}
