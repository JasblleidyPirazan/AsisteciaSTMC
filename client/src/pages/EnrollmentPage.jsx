import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';

const DAYS = [
  { key: 'lunes', label: 'Lun' },
  { key: 'martes', label: 'Mar' },
  { key: 'miercoles', label: 'Mié' },
  { key: 'jueves', label: 'Jue' },
  { key: 'viernes', label: 'Vie' },
  { key: 'sabado', label: 'Sáb' },
  { key: 'domingo', label: 'Dom' },
];

const POLICIES_TEXT = `REGLAMENTO ESCUELA DE TENIS SANTA MARÍA — 2026

I. Definiciones
1. Semestre: ciclo de 40 clases de 45 minutos cada una.
2. Clase regular: sesión de 45 minutos. Cuenta como 1 clase en el conteo del semestre.
3. Cada sesión programada cuenta como 1 clase; las clases no se acumulan ni se fraccionan.
4. Clase de reposición: sesión adicional para recuperar una clase a la que el alumno tenía derecho y que no se realizó por causa no atribuible a él. Las reposiciones son grupales y sus horarios los asigna el Club.
5. Estados de asistencia:
   • Asiste: el alumno asistió. Cuenta como clase recibida.
   • No asiste: el alumno no asistió por motivos propios. Cuenta como clase recibida y no genera reposición.
   • Justificada: ausencia por incapacidad médica certificada u otra causa aceptada por el Club. Da derecho a reposición.
   • Cancelada por lluvia: la clase no pudo realizarse por lluvia. Da derecho a reposición.

II. Horarios y organización
6. En 2026 los horarios son de lunes a viernes de 6:00 a 22:00 y sábados de 6:00 a 12:00 m. Durante el primer mes puede haber ajustes con previo aviso.
7. Los niveles ofrecidos son Bola Roja, Naranja y Verde para niños, y Principiantes, Intermedios y Avanzados para jóvenes y adultos.
8. Los grupos se organizan por nivel y edad, buscando la mayor homogeneidad posible.
9. El número máximo de alumnos por clase es 6 en Chiquitenis (4–6 años) y 4 en los demás niveles. El mínimo para abrir un grupo es 2 alumnos (período de ajuste de 15 días).

III. Pagos y materiales
10. El valor de las clases grupales incluye: profesor, asistente, cancha y materiales de entrenamiento.

IV. Reposiciones
11. Se harán reposiciones por clases Justificadas, canceladas por lluvia y días festivos. Son grupales y el Club asigna los horarios.
12. El Club aplicará una estrategia flexible: invitaciones a otros grupos, festivales de fin de semana, extensión del curso, clínicas con expertos, entre otros.
13. Las inasistencias por motivos del alumno (No asiste) no generan reposición.

V. Control de asistencia
14. El Club registra la asistencia e informa al correo o celular registrado. Reclamos sobre el registro deben hacerse dentro de la misma semana; pasado ese plazo, el registro se entiende aceptado.

VI. Indumentaria
15. Es obligatorio el uso de indumentaria adecuada para canchas de polvo de ladrillo.`;

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
  primaryGroupId: '',
  secondaryGroupId: '',
  acceptedPolicies: false,
};

export default function EnrollmentPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [filterDay, setFilterDay] = useState(null);
  const [filterLevel, setFilterLevel] = useState('');
  const [showPolicies, setShowPolicies] = useState(false);

  useEffect(() => {
    fetch('/api/enrollment/groups')
      .then((r) => r.json())
      .then((d) => { if (d.success) setGroups(d.data); })
      .catch(() => {})
      .finally(() => setLoadingGroups(false));
  }, []);

  const levels = useMemo(() => (
    [...new Set(groups.map((g) => g.ballLevel).filter(Boolean))].sort()
  ), [groups]);

  const filteredGroups = useMemo(() => (
    groups.filter((g) => {
      if (filterDay && !g[filterDay]) return false;
      if (filterLevel && g.ballLevel !== filterLevel) return false;
      return true;
    })
  ), [groups, filterDay, filterLevel]);

  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);

  const age = calculateAge(form.birthDate);
  const isMinor = age === null || age < 18;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function selectPrimary(id) {
    if (form.primaryGroupId === id) {
      update('primaryGroupId', '');
    } else {
      setForm((f) => ({
        ...f,
        primaryGroupId: id,
        secondaryGroupId: f.secondaryGroupId === id ? '' : f.secondaryGroupId,
      }));
    }
  }

  function selectSecondary(id) {
    if (form.secondaryGroupId === id) {
      update('secondaryGroupId', '');
    } else if (form.primaryGroupId !== id) {
      update('secondaryGroupId', id);
    }
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

    if (!form.primaryGroupId) {
      setError('Debes seleccionar al menos un grupo principal');
      return;
    }
    if (!form.acceptedPolicies) {
      setError('Debes aceptar el reglamento para continuar');
      return;
    }
    if (form.email !== form.emailConfirm) {
      setError('Los correos electrónicos no coinciden');
      return;
    }
    if (isMinor && age !== null && !form.parentName.trim()) {
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
        preferredGroupId: form.primaryGroupId || undefined,
        preferredSecondaryGroupId: form.secondaryGroupId || undefined,
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
    const primaryGroup = form.primaryGroupId ? groupById[form.primaryGroupId] : null;
    return (
      <div className="page">
        <div className="page-content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: '4rem' }}>🎾</div>
          <h2 className="mt-4">¡Solicitud enviada!</h2>
          <p className="text-gray mt-2" style={{ lineHeight: 1.6 }}>
            Recibimos la inscripción de <strong>{form.studentName}</strong>.
            {primaryGroup && (
              <><br />Grupo solicitado: <strong>{primaryGroup.code}</strong></>
            )}
            <br />
            Nos contactaremos pronto al correo <strong>{form.email}</strong> para confirmar el ingreso.
          </p>
          {!form.paymentProof && (
            <div className="alert alert-info mt-3" style={{ textAlign: 'left' }}>
              Recuerda que si no confirmas el pago en 3 días hábiles, el cupo se pierde.
            </div>
          )}
          <a href="/login" className="btn btn-primary btn-full mt-4">
            Ir al inicio de sesión
          </a>
        </div>
      </div>
    );
  }

  const sectionLabel = {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--gray-600)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ fontSize: '1.5rem' }}>🎾</div>
        <div>
          <h1>Inscripción STMC</h1>
          <p className="text-xs text-gray">Academia de Tenis Santa María</p>
        </div>
      </div>

      <div className="page-content">
        {error && <div className="alert alert-error mb-3" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>

          {/* ── Datos del Estudiante ── */}
          <div style={sectionLabel}>Datos del Estudiante</div>

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

          {/* ── Acudiente ── */}
          {isMinor && (
            <>
              <div className="divider" />
              <div style={sectionLabel}>
                Datos del Acudiente
                {age === null && (
                  <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 8, fontSize: '0.78rem' }}>
                    (ingresa fecha de nacimiento para verificar)
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="parentName">
                  Nombre del padre / madre / acudiente {age !== null ? '*' : ''}
                </label>
                <input id="parentName" type="text" className="form-input"
                  required={isMinor && age !== null}
                  value={form.parentName} onChange={(e) => update('parentName', e.target.value)}
                  maxLength={200} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="phoneMinor">Teléfono / WhatsApp del acudiente</label>
                <input id="phoneMinor" type="tel" className="form-input"
                  value={form.phone} onChange={(e) => update('phone', e.target.value)}
                  placeholder="+57 300 000 0000" maxLength={30} />
              </div>
            </>
          )}

          {/* ── Grupo(s) de Interés ── */}
          <div className="divider" />
          <div style={sectionLabel}>Grupo(s) de Interés</div>

          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {DAYS.map((d) => (
              <button key={d.key} type="button"
                className={`chip${filterDay === d.key ? ' chip-active' : ''}`}
                onClick={() => setFilterDay((prev) => prev === d.key ? null : d.key)}>
                {d.label}
              </button>
            ))}
          </div>

          {levels.length > 0 && (
            <div className="form-group">
              <select className="form-input form-select" value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}>
                <option value="">Todos los niveles</option>
                {levels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}

          {/* Selected groups summary */}
          {(form.primaryGroupId || form.secondaryGroupId) && (
            <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
              {form.primaryGroupId && groupById[form.primaryGroupId] && (
                <div className="flex items-center justify-between" style={{ marginBottom: form.secondaryGroupId ? 6 : 0 }}>
                  <span className="text-sm">
                    <span style={{ background: 'var(--green)', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', marginRight: 6 }}>PRINCIPAL</span>
                    {groupById[form.primaryGroupId].code} · {groupById[form.primaryGroupId].startTime}–{groupById[form.primaryGroupId].endTime}
                  </span>
                  <button type="button" className="btn btn-ghost"
                    style={{ minHeight: 24, padding: '0 8px', fontSize: '0.8rem' }}
                    onClick={() => update('primaryGroupId', '')}>✕</button>
                </div>
              )}
              {form.secondaryGroupId && groupById[form.secondaryGroupId] && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', marginRight: 6 }}>SECUNDARIO</span>
                    {groupById[form.secondaryGroupId].code} · {groupById[form.secondaryGroupId].startTime}–{groupById[form.secondaryGroupId].endTime}
                  </span>
                  <button type="button" className="btn btn-ghost"
                    style={{ minHeight: 24, padding: '0 8px', fontSize: '0.8rem' }}
                    onClick={() => update('secondaryGroupId', '')}>✕</button>
                </div>
              )}
            </div>
          )}

          <div className="alert" style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', fontSize: '0.78rem', marginBottom: 10, color: 'var(--gray-700)' }}>
            Los grupos pueden cambiar durante el semestre por nivel de juego u otras razones. La academia informará cualquier cambio con anticipación.
          </div>

          {/* Group list */}
          {loadingGroups ? (
            <div className="spinner" style={{ margin: '20px auto' }} />
          ) : filteredGroups.length === 0 ? (
            <div className="text-sm text-gray" style={{ textAlign: 'center', padding: '16px 0' }}>
              No hay grupos disponibles con los filtros seleccionados.
            </div>
          ) : (
            filteredGroups.map((g) => {
              const isPrimary = form.primaryGroupId === g.id;
              const isSecondary = form.secondaryGroupId === g.id;
              const isFull = g.availableSpots === 0;
              const daysStr = DAYS.filter((d) => g[d.key]).map((d) => d.label).join(' · ');
              return (
                <div key={g.id} className="card mb-2"
                  style={{
                    border: isPrimary
                      ? '2px solid var(--green)'
                      : isSecondary
                      ? '2px solid var(--blue)'
                      : '1px solid var(--gray-200)',
                    opacity: isFull && !isPrimary && !isSecondary ? 0.65 : 1,
                    transition: 'border-color 0.15s',
                  }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{g.code}</span>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 600,
                      color: g.availableSpots > 0 ? 'var(--green)' : 'var(--red)',
                    }}>
                      {g.availableSpots > 0
                        ? `${g.availableSpots} cupo${g.availableSpots !== 1 ? 's' : ''} libre${g.availableSpots !== 1 ? 's' : ''}`
                        : 'Sin cupos'}
                    </span>
                  </div>
                  <div className="text-sm text-gray">{daysStr} · {g.startTime}–{g.endTime}</div>
                  {g.ballLevel && <div className="text-xs text-gray">Nivel: {g.ballLevel}</div>}
                  <div className="text-xs text-gray" style={{ marginBottom: 10 }}>Prof.: {g.professor}</div>

                  <div className="flex gap-2">
                    <button type="button"
                      className={`btn ${isPrimary ? 'btn-success' : 'btn-outline'}`}
                      style={{ flex: 1, minHeight: 36, fontSize: '0.78rem' }}
                      disabled={isFull && !isPrimary}
                      onClick={() => selectPrimary(g.id)}>
                      {isPrimary ? '✓ Principal' : 'Como principal'}
                    </button>
                    {!isPrimary && (
                      <button type="button"
                        className={`btn ${isSecondary ? 'btn-primary' : 'btn-outline'}`}
                        style={{ flex: 1, minHeight: 36, fontSize: '0.78rem' }}
                        disabled={(isFull && !isSecondary) || !form.primaryGroupId}
                        title={!form.primaryGroupId ? 'Primero selecciona un grupo principal' : ''}
                        onClick={() => selectSecondary(g.id)}>
                        {isSecondary ? '✓ Secundario' : 'Como secundario'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* ── Contacto y Salud ── */}
          <div className="divider" />
          <div style={sectionLabel}>Contacto y Salud</div>

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
          <div style={sectionLabel}>Confirmación de Pago</div>
          <p className="text-xs text-gray" style={{ marginBottom: 12 }}>
            El soporte de pago es opcional en este momento. Si no lo envías, recuerda que el cupo se pierde si no confirmas el pago en los primeros 3 días hábiles tras recibir la aprobación.
          </p>

          <div className="form-group">
            <label className="form-label" htmlFor="paymentDate">Fecha de pago</label>
            <input id="paymentDate" type="date" className="form-input"
              value={form.paymentDate} onChange={(e) => update('paymentDate', e.target.value)}
              max={new Date().toISOString().slice(0, 10)} />
          </div>

          <div className="form-group">
            <label className="form-label">Soporte de pago (opcional)</label>
            {imagePreview ? (
              <div style={{ position: 'relative' }}>
                <img src={imagePreview} alt="Soporte de pago"
                  style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--gray-200)', maxHeight: 220, objectFit: 'cover' }} />
                <button type="button" onClick={removeImage}
                  style={{
                    position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)',
                    color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28,
                    cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
              </div>
            ) : (
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: '2px dashed var(--gray-300)', borderRadius: 'var(--radius)',
                padding: '20px 16px', cursor: 'pointer', color: 'var(--gray-600)',
                background: compressing ? 'var(--gray-100)' : 'transparent',
              }}>
                <span style={{ fontSize: '2rem', marginBottom: 6 }}>📎</span>
                <span className="text-sm">{compressing ? 'Procesando imagen...' : 'Toca para adjuntar comprobante'}</span>
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

          {/* ── Reglamento ── */}
          <div className="divider" />
          <div style={sectionLabel}>Reglamento</div>

          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, marginBottom: 12 }}>
            <button type="button"
              style={{
                width: '100%', textAlign: 'left', padding: '12px 14px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.85rem', color: 'var(--gray-700)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
              onClick={() => setShowPolicies((p) => !p)}>
              <span>Reglamento Escuela de Tenis Santa María 2026</span>
              <span style={{ fontSize: '0.7rem', marginLeft: 8 }}>{showPolicies ? '▲ Ocultar' : '▼ Leer'}</span>
            </button>
            {showPolicies && (
              <div style={{
                padding: '0 14px 14px',
                fontSize: '0.78rem', color: 'var(--gray-700)',
                lineHeight: 1.7, whiteSpace: 'pre-wrap',
                borderTop: '1px solid var(--gray-200)',
                paddingTop: 12,
              }}>
                {POLICIES_TEXT}
              </div>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
            <input type="checkbox" checked={form.acceptedPolicies}
              onChange={(e) => update('acceptedPolicies', e.target.checked)}
              style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }} />
            <span className="text-sm" style={{ lineHeight: 1.5 }}>
              He leído y acepto el Reglamento de la Escuela de Tenis Santa María
            </span>
          </label>

          <button type="submit" className="btn btn-primary btn-full btn-lg"
            disabled={
              loading || compressing ||
              !form.studentName || !form.email || !form.emailConfirm ||
              !form.primaryGroupId || !form.acceptedPolicies
            }>
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
