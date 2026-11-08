import { useState, useEffect } from 'react';
import { api } from '../api/client';

// Correo semanal de avance (nota 66): vista previa de lo que el script de envío
// (Google Apps Script) mandará a cada acudiente. Aquí no se envía nada.
export default function WeeklyEmailPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/notifications/weekly-progress').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="text-sm text-gray">Armando los correos…</div>;

  const term = q.trim().toLowerCase();
  const list = data.recipients.filter((r) => !term || r.name.toLowerCase().includes(term) || r.to.toLowerCase().includes(term));
  const copyEmails = () => navigator.clipboard?.writeText(data.recipients.map((r) => r.to).join(', '));

  return (
    <>
      <p className="text-sm text-gray mb-2">
        Cada semana se envía un correo a los acudientes de estudiantes con <b>clases por reponer</b> (lluvia, canceladas por la
        Escuela y justificadas): avance del paquete, detalle clase a clase y su enlace para agendar. Esta es la vista previa de
        lo que se enviaría hoy.
      </p>
      {!data.feedEnabled && (
        <div className="alert alert-info mb-2">
          El envío automático aún no está conectado: falta la variable <code>NOTIFY_API_KEY</code> en Railway y el script de
          Google (ver <code>docs/correo-semanal.md</code>).
        </div>
      )}
      <div className="flex items-center mb-2" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="badge">✉️ {data.recipients.length} correos</span>
        {data.skipped.length > 0 && <span className="badge" style={{ background: '#fef3c7' }}>⚠️ {data.skipped.length} sin correo</span>}
        <input className="form-input" style={{ flex: 1, minWidth: 160 }} placeholder="Buscar estudiante o correo"
          value={q} onChange={(e) => setQ(e.target.value)} />
        {data.recipients.length > 0 && <button className="btn btn-outline" onClick={copyEmails}>Copiar correos</button>}
      </div>

      {data.recipients.length === 0 && <div className="alert alert-info">Hoy no hay estudiantes con clases por reponer.</div>}
      {list.map((r) => (
        <div key={r.studentId} className="card mb-2">
          <div className="flex items-center justify-between" style={{ gap: 8, cursor: 'pointer' }}
            onClick={() => setOpen(open === r.studentId ? null : r.studentId)}>
            <div style={{ minWidth: 0 }}>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-gray">{r.to} · {r.pendientes} por reponer · {r.porAgendar} por agendar</div>
            </div>
            <span className="text-sm">{open === r.studentId ? '▲' : '▼'}</span>
          </div>
          {open === r.studentId && (
            <div className="mt-2">
              <div className="text-xs text-gray mb-1">Asunto: <b>{r.subject}</b></div>
              <iframe title={`Correo ${r.name}`} srcDoc={r.html} sandbox=""
                style={{ width: '100%', height: 640, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }} />
            </div>
          )}
        </div>
      ))}

      {data.skipped.length > 0 && (
        <div className="card mt-3">
          <div className="font-medium mb-1">⚠️ Tienen clases por reponer pero no tienen correo registrado</div>
          <p className="text-xs text-gray mb-2">Agrega el correo en su ficha (Estudiantes) o envíales el enlace por WhatsApp desde “Enlaces reposición”.</p>
          {data.skipped.map((s) => <div key={s.studentId} className="text-sm">{s.name}</div>)}
        </div>
      )}
    </>
  );
}
