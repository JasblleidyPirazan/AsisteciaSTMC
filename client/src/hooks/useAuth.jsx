import { useState, useEffect, createContext, useContext } from 'react';
import { api, setToken, removeToken, getUser } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getUser);
  const [loading, setLoading] = useState(false);

  // El token solo trae {id, role}. Hidratamos con /me para conocer los enlaces
  // profesor/asistente (rol dual) y que sobrevivan a un refresco de página.
  useEffect(() => {
    if (!getUser()) return;
    api.get('/auth/me').then((me) => setUser((u) => ({ ...u, ...me }))).catch(() => {});
  }, []);

  async function login(email, password) {
    setLoading(true);
    try {
      const data = await api.post('/auth/login', { email, password });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    removeToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
