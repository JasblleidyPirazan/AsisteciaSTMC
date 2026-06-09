const BASE_URL = '/api';

function getToken() {
  return localStorage.getItem('stmc_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('stmc_token');
    window.location.href = '/login';
    return;
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Error del servidor');
  return data.data;
}

export const api = {
  get: (path, params) => {
    const url = params ? `${path}?${new URLSearchParams(params)}` : path;
    return request(url);
  },
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export function setToken(token) {
  localStorage.setItem('stmc_token', token);
}

export function removeToken() {
  localStorage.removeItem('stmc_token');
}

export function getUser() {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}
