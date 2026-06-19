import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Banner, Header, Loading } from '../../components/ui.jsx';

// Gestión de usuarios (profesores / asistentes / admins).
export default function Users() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'TEACHER', password: '' });

  function load() {
    api.get('/admin/users').then((d) => setUsers(d.users)).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function create(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/admin/users', form);
      setForm({ name: '', email: '', role: 'TEACHER', password: '' });
      load();
    } catch (err) { setError(err.message); }
  }

  if (!users) return <Loading />;

  return (
    <>
      <Header title="Usuarios" back="/admin" />
      <div className="content">
        {error && <Banner>{error}</Banner>}
        <form className="card stack" onSubmit={create}>
          <h2 style={{ fontSize: '1rem', margin: 0 }}>Nuevo usuario</h2>
          <div className="field" style={{ margin: 0 }}>
            <label>Nombre</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Correo</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Rol</label>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="TEACHER">Profesor</option>
              <option value="ASSISTANT">Asistente</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Contraseña</label>
            <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} minLength={6} required />
          </div>
          <button className="btn btn-primary">Crear usuario</button>
        </form>

        {users.map((u) => (
          <div className="card" key={u.id}>
            <div className="row">
              <strong>{u.name}</strong>
              <span className="tag">{u.role}</span>
            </div>
            <div className="muted">{u.email}{!u.active && ' · inactivo'}</div>
          </div>
        ))}
      </div>
    </>
  );
}
