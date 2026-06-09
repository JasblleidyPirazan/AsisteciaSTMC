import { useState } from 'react';
import { api } from '../api/client';

export default function EnrollmentPage() {
  const [form, setForm] = useState({ studentName: '', parentName: '', email: '', phone: '', notes: '' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/enrollment', form);
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="page">
        <div className="page-content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: '4rem' }}>🎾</div>
          <h2 className="mt-4">¡Solicitud enviada!</h2>
          <p className="text-gray mt-2">
            Nos contactaremos pronto al correo <strong>{form.email}</strong> para confirmar la inscripción.
          </p>
          <a href="/login" className="btn btn-primary btn-full mt-4">
            Ir al inicio de sesión
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontSize: '1.5rem' }}>🎾</div>
        <div>
          <h1>Inscripción STMC</h1>
          <p className="text-xs text-gray">Academia de Tenis</p>
        </div>
      </div>

      <div className="page-content">
        <p className="text-gray text-sm mb-4">
          Completa el formulario y nos pondremos en contacto para confirmar el ingreso.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre del estudiante *</label>
            <input type="text" className="form-input" value={form.studentName}
              onChange={(e) => update('studentName', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Nombre del padre / madre / acudiente *</label>
            <input type="text" className="form-input" value={form.parentName}
              onChange={(e) => update('parentName', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Correo electrónico *</label>
            <input type="email" className="form-input" value={form.email}
              onChange={(e) => update('email', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono / WhatsApp</label>
            <input type="tel" className="form-input" value={form.phone}
              onChange={(e) => update('phone', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Notas adicionales</label>
            <textarea className="form-input" style={{ minHeight: 80, resize: 'none' }}
              value={form.notes} onChange={(e) => update('notes', e.target.value)}
              placeholder="Edad del estudiante, disponibilidad, nivel..." />
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>

        <div className="text-center mt-4">
          <a href="/login" className="btn btn-ghost text-sm">¿Ya tienes cuenta? Ingresar →</a>
        </div>
      </div>
    </div>
  );
}
