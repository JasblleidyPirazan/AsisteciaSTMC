import { useState } from 'react';
import { api } from '../api/client';
import { POLICIES_TEXT } from '../utils/policies';

// Flujo público: el acudiente/estudiante entra con el DOCUMENTO del estudiante,
// ve sus datos (y los de sus hermanos), corrige el contacto y acepta políticas.
export default function ValidationPage() {
  const [step, setStep] = useState('lookup'); // lookup | edit | done
  const [document, setDocument] = useState('');
  const [students, setStudents] = useState([]);
  const [accepted, setAccepted] = useState(false);
  const [showPolicies, setShowPolicies] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLookup(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post('/validation/lookup', { document: document.trim() });
      if (!data.found || data.students.length === 0) {
        setError('No encontramos estudiantes con ese documento. Verifica el número o contacta a la Escuela.');
      } else {
        setStudents(data.students);
        setStep('edit');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function setField(id, key, val) {
    setStudents((list) => list.map((s) => (s.id === id ? { ...s, [key]: val } : s)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!accepted) { setError('Debes aceptar las políticas para continuar.'); return; }
    setError(''); setLoading(true);
    try {
      await api.post('/validation/submit', {
        document: document.trim(),
        students: students.map((s) => ({
          id: s.id, email: s.email, phone: s.phone, guardianName: s.guardianName, birthDate: s.birthDate,
        })),
        policiesAccepted: true,
      });
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ flex: 1 }}>
          <h1>🎾 Validación de datos</h1>
          <p className="text-xs text-gray">Escuela de Tenis Santa María</p>
        </div>
      </div>

      <div className="page-content">
        {error && <div className="alert alert-error mb-3">{error}</div>}

        {step === 'lookup' && (
          <form onSubmit={handleLookup}>
            <p className="text-sm text-gray mb-3">
              Ingresa el <strong>documento de identidad del estudiante</strong> para ver y confirmar
              sus datos. Si tienes varios hijos con el mismo acudiente, aparecerán todos.
            </p>
            <div className="form-group">
              <label className="form-label">Documento del estudiante</label>
              <input type="text" className="form-input" required autoFocus inputMode="numeric"
                value={document} onChange={(e) => setDocument(e.target.value)} maxLength={40}
                placeholder="Ej: 1034567890" />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading || !document.trim()}>
              {loading ? 'Buscando…' : 'Buscar mis datos'}
            </button>
          </form>
        )}

        {step === 'edit' && (
          <form onSubmit={handleSubmit}>
            <p className="text-sm text-gray mb-3">
              Revisa y corrige los datos de contacto. El nombre y el documento los administra la Escuela;
              si hay un error ahí, avísanos.
            </p>

            {students.map((s) => (
              <div key={s.id} className="card mb-3">
                <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <h3>{s.name}</h3>
                  {s.groups?.length > 0 && <span className="badge badge-blue">{s.groups.join(', ')}</span>}
                </div>
                <div className="text-xs text-gray mb-2">Documento: {s.document || '—'}</div>

                <div className="form-group">
                  <label className="form-label">Correo electrónico</label>
                  <input type="email" className="form-input" value={s.email}
                    onChange={(e) => setField(s.id, 'email', e.target.value)} maxLength={254} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">WhatsApp</label>
                    <input type="text" className="form-input" value={s.phone}
                      onChange={(e) => setField(s.id, 'phone', e.target.value)} maxLength={40} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha de nacimiento</label>
                    <input type="date" className="form-input" value={s.birthDate}
                      onChange={(e) => setField(s.id, 'birthDate', e.target.value)} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Acudiente</label>
                  <input type="text" className="form-input" value={s.guardianName}
                    onChange={(e) => setField(s.id, 'guardianName', e.target.value)} maxLength={200} />
                </div>
              </div>
            ))}

            <div className="card mb-3">
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
                  style={{ marginTop: 3 }} />
                <span className="text-sm">
                  He leído y acepto las <button type="button" className="btn-link"
                    onClick={() => setShowPolicies(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}>
                    políticas de la Escuela</button>.
                </span>
              </label>
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loading || !accepted}>
              {loading ? 'Guardando…' : 'Confirmar datos y aceptar'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: '4rem' }}>✅</div>
            <h2 className="mt-3">¡Gracias!</h2>
            <p className="text-gray mt-2">
              Tus datos quedaron confirmados y registramos tu aceptación de las políticas.
              Ya puedes cerrar esta página.
            </p>
          </div>
        )}
      </div>

      {showPolicies && (
        <div className="modal-overlay" onClick={() => setShowPolicies(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="flex items-center justify-between mb-2">
              <h3>Políticas de la Escuela</h3>
              <button className="btn btn-ghost" style={{ minHeight: 30 }} onClick={() => setShowPolicies(false)}>✕</button>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.5 }}>
              {POLICIES_TEXT}
            </div>
            <button className="btn btn-primary btn-full mt-3" onClick={() => { setAccepted(true); setShowPolicies(false); }}>
              Aceptar políticas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
