import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Banner, Header } from '../components/ui.jsx';

// HU-INS-01: Formulario público de inscripción (sin autenticación, mobile-first).
export default function EnrollmentPublic() {
  const [form, setForm] = useState({ studentName: '', parentName: '', email: '', phone: '' });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/enrollment', form);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <>
        <Header title="Inscripción" />
        <div className="content">
          <Banner type="success">¡Solicitud enviada! El administrador la revisará y te contactará.</Banner>
          <Link className="btn btn-outline" to="/login">Volver al inicio</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Inscripción" back="/login" />
      <div className="content">
        <p className="muted">Completa los datos para solicitar el ingreso. No necesitas una cuenta.</p>
        {error && <Banner type="error">{error}</Banner>}
        <form onSubmit={onSubmit} className="card">
          <div className="field">
            <label>Nombre del estudiante *</label>
            <input value={form.studentName} onChange={set('studentName')} required />
          </div>
          <div className="field">
            <label>Tu nombre (acudiente) *</label>
            <input value={form.parentName} onChange={set('parentName')} required />
          </div>
          <div className="field">
            <label>Correo *</label>
            <input type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div className="field">
            <label>Teléfono *</label>
            <input value={form.phone} onChange={set('phone')} required />
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
        </form>
      </div>
    </>
  );
}
