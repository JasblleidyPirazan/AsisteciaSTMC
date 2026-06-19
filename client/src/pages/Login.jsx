import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Banner } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="brand">
        <div className="logo">🎾</div>
        <h1>Asistencia Tenis</h1>
        <p className="muted">Ingresa con tu cuenta</p>
      </div>

      {error && <Banner type="error">{error}</Banner>}

      <form onSubmit={onSubmit} className="card">
        <div className="field">
          <label>Correo</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Ingresando…' : 'Iniciar sesión'}</button>
      </form>

      <p className="center muted">
        ¿Quieres inscribir a tu hijo/a? <Link to="/enrollment">Inscríbete aquí</Link>
      </p>
    </div>
  );
}
