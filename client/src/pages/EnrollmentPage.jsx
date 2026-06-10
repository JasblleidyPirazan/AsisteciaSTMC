import { useState } from 'react';
import { api } from '../api/client';

function calculateAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate + 'T00:00:00');
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('La imagen no puede superar 10 MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1400;
        let w = img.width;
        let h = img.height;
        if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsDataURL(file);
  });
}

const EMPTY_FORM = {
  studentName: '',
  birthDate: '',
  parentName: '',
  email: '',
  emailConfirm: '',
  phone: '',
  eps: '',
  paymentDate: '',
  paymentProof: null,
  notes: '',
};

export default function EnrollmentPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [compressing, setCompressing] = useState(false);

  const age = calculateAge(form.birthDate);
  const isMinor = age === null || age < 18;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setCompressing(true);
    try {
      const dataUrl = await compressImage(file);
      setForm((f) => ({ ...f, paymentProof: dataUrl }));
      setImagePreview(dataUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setCompressing(false);
    }
  }

  function removeImage() {
    setForm((f) => ({ ...f, paymentProof: null }));
    setImagePreview(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.email !== form.emailConfirm) {
      setError('Los correos electrónicos no coinciden');
      return;
    }
    if (isMinor && !form.parentName.trim()) {
      setError('El nombre del acudiente es requerido para menores de edad');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        studentName: form.studentName,
        birthDate: form.birthDate || undefined,
        parentName: form.parentName || undefined,
        email: form.email,
        phone: form.phone || undefined,
        eps: form.eps || undefined,
        paymentDate: form.paymentDate || undefined,
        paymentProof: form.paymentProof || undefined,
        notes: form.notes || undefined,
      };
      await api.post('/enrollment', payload);
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
          <p className="text-gray mt-2" style={{ lineHeight: 1.6 }}>
            Recibimos la inscripción de <strong>{form.studentName}</strong>.
            <br />
            Nos contactaremos pronto al correo <strong>{form.email}</strong> para confirmar el ingreso.
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
        {error && <div className="alert alert-error mb-3" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>

          {/* ── Datos del Estudiante ── */}
          <div style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Datos del Estudiante
            </h3>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="studentName">Nombre completo *</label>
            <input id="studentName" type="text" className="form-input" required
              value={form.studentName} onChange={(e) => update('studentName', e.target.value)}
              maxLength={200} placeholder="Nombre y apellidos del estudiante" />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="birthDate">Fecha de nacimiento</label>
            <input id="birthDate" type="date" className="form-input"
              value={form.birthDate} onChange={(e) => update('birthDate', e.target.value)}
              max={new Date().toISOString().slice(0, 10)} />
            {age !== null && (
              <span className="text-xs" style={{ color: age < 18 ? 'var(--blue)' : 'var(--green)' }}>
                {age} años · {age < 18 ? 'Menor de edad — acudiente requerido' : 'Mayor de edad'}
              </span>
            )}
          </div>

          {/* ── Acudiente (required if minor) ── */}
          {isMinor && (
            <>
              <div className="divider" />
              <div style={{ marginBottom: 8 }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Datos del Acudiente
                </h3>
                {age === null && (
                  <p className="text-xs text-gray">Ingresa la fecha de nacimiento para verificar si aplica</p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="parentName">
                  Nombre del padre / madre / acudiente {isMinor && age !== null ? '*' : ''}
                </label>
                <input id="parentName" type="text" className="form-input"
                  required={isMinor && age !== null}
                  value={form.parentName} onChange={(e) => update('parentName', e.target.value)}
                  maxLength={200} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="phone">Teléfono / WhatsApp del acudiente</label>
                <input id="phone" type="tel" className="form-input"
                  value={form.phone} onChange={(e) => update('phone', e.target.value)}
                  placeholder="+57 300 000 0000" maxLength={30} />
              </div>
            </>
          )}

          {/* ── Contacto y Salud ── */}
          <div className="divider" />
          <div style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Contacto y Salud
            </h3>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Correo electrónico *</label>
            <input id="email" type="email" className="form-input" required
              value={form.email} onChange={(e) => update('email', e.target.value)}
              placeholder="correo@ejemplo.com" maxLength={254} autoComplete="email" />
            <span className="text-xs text-gray">A este correo se enviarán los reportes de asistencia</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="emailConfirm">Confirmar correo electrónico *</label>
            <input id="emailConfirm" type="email" className="form-input" required
              value={form.emailConfirm} onChange={(e) => update('emailConfirm', e.target.value)}
              placeholder="Repite el correo" maxLength={254}
              style={form.emailConfirm && form.email !== form.emailConfirm
                ? { borderColor: 'var(--red)' } : {}} />
            {form.emailConfirm && form.email !== form.emailConfirm && (
              <span className="text-xs" style={{ color: 'var(--red)' }}>Los correos no coinciden</span>
            )}
          </div>

          {!isMinor && (
            <div className="form-group">
              <label className="form-label" htmlFor="phone">Teléfono / WhatsApp</label>
              <input id="phone" type="tel" className="form-input"
                value={form.phone} onChange={(e) => update('phone', e.target.value)}
                placeholder="+57 300 000 0000" maxLength={30} />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="eps">EPS</label>
            <input id="eps" type="text" className="form-input"
              value={form.eps} onChange={(e) => update('eps', e.target.value)}
              placeholder="Nombre de la EPS" maxLength={100} />
          </div>

          {/* ── Pago ── */}
          <div className="divider" />
          <div style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pago de Inscripción
            </h3>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="paymentDate">Fecha de pago</label>
            <input id="paymentDate" type="date" className="form-input"
              value={form.paymentDate} onChange={(e) => update('paymentDate', e.target.value)}
              max={new Date().toISOString().slice(0, 10)} />
          </div>

          <div className="form-group">
            <label className="form-label">Soporte de pago (imagen)</label>
            {imagePreview ? (
              <div style={{ position: 'relative' }}>
                <img src={imagePreview} alt="Soporte de pago"
                  style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--gray-200)', maxHeight: 220, objectFit: 'cover' }} />
                <button type="button" onClick={removeImage}
                  style={{
                    position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)',
                    color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28,
                    cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  ✕
                </button>
              </div>
            ) : (
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: '2px dashed var(--gray-300)', borderRadius: 'var(--radius)',
                padding: '24px 16px', cursor: 'pointer', color: 'var(--gray-600)',
                background: compressing ? 'var(--gray-100)' : 'transparent',
              }}>
                <span style={{ fontSize: '2rem', marginBottom: 8 }}>📎</span>
                <span className="text-sm">{compressing ? 'Procesando imagen...' : 'Toca para adjuntar foto del comprobante'}</span>
                <span className="text-xs text-gray mt-1">JPG, PNG · máx. 10 MB</span>
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={handleImageChange} disabled={compressing} />
              </label>
            )}
          </div>

          {/* ── Notas ── */}
          <div className="form-group">
            <label className="form-label" htmlFor="notes">Notas adicionales</label>
            <textarea id="notes" className="form-input" style={{ minHeight: 72, resize: 'none' }}
              value={form.notes} onChange={(e) => update('notes', e.target.value)}
              placeholder="Nivel de juego, lesiones, disponibilidad de horario..." maxLength={1000} />
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg"
            disabled={loading || compressing || !form.studentName || !form.email || !form.emailConfirm}>
            {loading ? 'Enviando...' : 'Enviar solicitud de inscripción'}
          </button>
        </form>

        <div className="text-center mt-4">
          <a href="/login" className="btn btn-ghost text-sm">¿Ya tienes cuenta? Ingresar →</a>
        </div>
      </div>
    </div>
  );
}
