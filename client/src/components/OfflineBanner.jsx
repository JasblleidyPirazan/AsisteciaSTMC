import { useOffline } from '../hooks/useOffline';

export default function OfflineBanner() {
  const isOffline = useOffline();
  if (!isOffline) return null;
  return (
    <div className="alert-offline">
      ⚠️ Modo offline — los datos se sincronizarán al recuperar conexión
    </div>
  );
}
