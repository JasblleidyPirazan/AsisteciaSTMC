import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from './useAuth';

const PermissionsContext = createContext(null);
const FULL_ACCESS = ['SUPER_ADMIN', 'DEVELOPER'];

export function PermissionsProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!user) { setData(null); setLoading(false); return Promise.resolve(); }
    setLoading(true);
    return api.get('/permissions')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => { refetch(); }, [refetch]);

  const can = useCallback((moduleKey, action = 'view') => {
    if (!user) return false;
    if (FULL_ACCESS.includes(user.role)) return true;
    const cell = data?.matrix?.[user.role]?.[moduleKey];
    if (!cell) return false;
    return action === 'edit' ? !!cell.edit : !!cell.view;
  }, [user, data]);

  return (
    <PermissionsContext.Provider
      value={{ can, loading, matrix: data?.matrix, modules: data?.modules, roles: data?.roles, refetch }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext) || { can: () => false, loading: true };
}
