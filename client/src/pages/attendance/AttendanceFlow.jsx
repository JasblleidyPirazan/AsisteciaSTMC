import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Banner, Header, Loading, money, useOnline } from '../../components/ui.jsx';
import { queueSubmit, sessionCache } from '../../api/offlineQueue.js';
import StudentRow from './StudentRow.jsx';
import AddReposition from './AddReposition.jsx';

const today = () => new Date().toISOString().slice(0, 10);

// Flujo de registro de asistencia (HU-AST-01..06), mobile-first, máx 5 pantallas.
export default function AttendanceFlow() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const date = today();

  const [ctx, setCtx] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(2); // 1 = dashboard; aquí empezamos en "¿se realizó?"
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Estado del reporte
  const [substituteId, setSubstituteId] = useState(null);
  const [attendance, setAttendance] = useState({}); // studentId -> {status, attendanceType, name, justification}
  const [cancelledHalf, setCancelledHalf] = useState(false);
  const [preview, setPreview] = useState(null);

  const canSeeCost = user.role === 'TEACHER' || user.role === 'ADMIN';

  useEffect(() => {
    const cached = sessionCache.get(groupId, date);
    api.get(`/sessions/context/${groupId}?date=${date}`)
      .then((d) => {
        setCtx(d);
        sessionCache.set(groupId, date, d);
        setSubstituteId(d.group.professor.id);
        if (d.session?.locked) setDone(true);
        seedAttendance(d);
      })
      .catch((e) => {
        if (cached) { setCtx(cached); setSubstituteId(cached.group.professor.id); seedAttendance(cached); }
        else setError(e.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  function seedAttendance(d) {
    const init = {};
    for (const s of d.students) {
      init[s.studentId] = { name: s.name, status: 'PRESENTE', attendanceType: 'REGULAR' };
    }
    setAttendance(init);
  }

  const attendanceList = useMemo(
    () => Object.entries(attendance).map(([studentId, v]) => ({ studentId, ...v })),
    [attendance],
  );

  function setStatus(studentId, status) {
    setAttendance((a) => ({ ...a, [studentId]: { ...a[studentId], status } }));
  }
  function setJustification(studentId, justification) {
    setAttendance((a) => ({ ...a, [studentId]: { ...a[studentId], justification } }));
  }
  function addReposition(student) {
    setAttendance((a) => ({
      ...a,
      [student.id]: { name: student.name, status: 'PRESENTE', attendanceType: 'REPOSICION' },
    }));
  }
  function removeStudent(studentId) {
    setAttendance((a) => {
      const next = { ...a };
      delete next[studentId];
      return next;
    });
  }

  // HU-AST-03: clase no realizada -> cancelar.
  async function cancelClass(reason) {
    setBusy(true);
    setError(null);
    const payload = { groupId, date, held: false, cancellationReason: reason, attendance: [] };
    try {
      if (online) await api.post('/sessions/submit', payload);
      else queueSubmit(payload);
      setDone(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  // HU-AST-06: vista previa del pago al pasar al resumen.
  async function goToSummary() {
    setStep(5);
    if (!canSeeCost) return;
    try {
      const d = await api.post('/sessions/preview', {
        groupId,
        cancelledHalf,
        hasAssistant: Boolean(ctx.session?.assistantId),
        attendance: attendanceList.map(({ studentId, status, attendanceType }) => ({ studentId, status, attendanceType })),
      });
      setPreview(d.summary);
    } catch { /* sin preview si no hay red */ }
  }

  // Recalcula preview en tiempo real al togglear mitad (HU-AST-04/06).
  useEffect(() => {
    if (step === 5 && canSeeCost && online) goToSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelledHalf]);

  async function submit() {
    setBusy(true);
    setError(null);
    const payload = {
      groupId,
      date,
      held: true,
      cancelledHalf,
      substituteProfessorId: substituteId !== ctx.group.professor.id ? substituteId : null,
      attendance: attendanceList.map(({ studentId, status, attendanceType, justification }) => ({
        studentId, status, attendanceType, justification,
      })),
    };
    try {
      if (online) await api.post('/sessions/submit', payload);
      else queueSubmit(payload);
      setDone(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (error && !ctx) return <div className="content"><Banner>{error}</Banner></div>;
  if (!ctx) return <Loading message="Cargando clase…" />;

  if (done) {
    return (
      <>
        <Header title="Reporte enviado" />
        <div className="content center">
          <div style={{ fontSize: '3rem' }}>✅</div>
          <Banner type={online ? 'success' : 'offline'}>
            {online ? 'Asistencia registrada correctamente.' : 'Guardado offline. Se enviará al reconectar.'}
          </Banner>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Volver al inicio</button>
        </div>
      </>
    );
  }

  if (ctx.session?.locked) {
    return (
      <>
        <Header title={ctx.group.code} back="/" />
        <div className="content">
          <Banner type="success">Este reporte ya fue enviado y está bloqueado.</Banner>
          <button className="btn btn-outline" onClick={() => navigate('/')}>Volver</button>
        </div>
      </>
    );
  }

  const isDouble = ctx.group.classType === 'doble';

  return (
    <>
      <Header title={ctx.group.code} back="/" />
      <div className="content">
        {!online && <Banner type="offline">Modo offline</Banner>}
        {error && <Banner type="error">{error}</Banner>}

        {/* Pantalla 2: ¿La clase se realizó? */}
        {step === 2 && (
          <div className="stack">
            <h2 className="center">¿La clase se realizó hoy?</h2>
            <button className="btn btn-primary btn-lg" onClick={() => setStep(3)}>SÍ</button>
            <NoClass busy={busy} onCancel={cancelClass} />
          </div>
        )}

        {/* Pantalla 3: ¿Quién dictó la clase? (HU-AST-05) */}
        {step === 3 && (
          <div className="stack">
            <h2>¿Quién dictó la clase?</h2>
            <div className="field">
              <label>Profesor</label>
              <select value={substituteId} onChange={(e) => setSubstituteId(e.target.value)}>
                {ctx.professors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.id === ctx.group.professor.id ? ' (titular)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={() => setStep(4)}>Continuar</button>
          </div>
        )}

        {/* Pantalla 4: Lista de estudiantes (HU-AST-01/02) */}
        {step === 4 && (
          <div>
            <h2>Asistencia</h2>
            <div className="card">
              {attendanceList.length === 0 && <p className="muted">Sin estudiantes. Agrega una reposición.</p>}
              {attendanceList.map((s) => (
                <StudentRow
                  key={s.studentId}
                  student={s}
                  onStatus={(st) => setStatus(s.studentId, st)}
                  onJustification={(j) => setJustification(s.studentId, j)}
                  onRemove={s.attendanceType === 'REPOSICION' ? () => removeStudent(s.studentId) : null}
                />
              ))}
            </div>
            <AddReposition existingIds={attendanceList.map((s) => s.studentId)} onAdd={addReposition} />
            <button className="btn btn-primary" onClick={goToSummary}>Ver resumen</button>
          </div>
        )}

        {/* Pantalla 5: Resumen + cálculo de pago (HU-AST-06) */}
        {step === 5 && (
          <div className="stack">
            <h2>Resumen</h2>
            <div className="card">
              <div className="summary-line"><span>Presentes</span><strong>{attendanceList.filter((s) => s.status === 'PRESENTE').length}</strong></div>
              <div className="summary-line"><span>Ausentes</span><strong>{attendanceList.filter((s) => s.status === 'AUSENTE').length}</strong></div>
              <div className="summary-line"><span>Justificados</span><strong>{attendanceList.filter((s) => s.status === 'JUSTIFICADA').length}</strong></div>
              <div className="summary-line"><span>Tipo de clase</span><strong>{ctx.group.classType}</strong></div>
            </div>

            {/* HU-AST-04: toggle solo si la clase es doble */}
            {isDouble && (
              <div className="card">
                <div className="toggle">
                  <span>¿Se canceló a la mitad?</span>
                  <label className="switch">
                    <input type="checkbox" checked={cancelledHalf} onChange={(e) => setCancelledHalf(e.target.checked)} />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            )}

            {/* Cálculo de pago: solo Profe/Admin (HU-AST-06) */}
            {canSeeCost && preview && (
              <div className="card">
                <div className="muted">{preview.formula}</div>
                <div className="summary-line"><span>Pago profesor</span><strong>{money(preview.professorTotal)}</strong></div>
                {preview.assistantTotal > 0 && (
                  <div className="summary-line"><span>Pago asistente</span><strong>{money(preview.assistantTotal)}</strong></div>
                )}
                <div className="row" style={{ marginTop: 8 }}>
                  <span>Total sesión</span>
                  <span className="summary-total">{money(preview.professorTotal + preview.assistantTotal)}</span>
                </div>
              </div>
            )}

            <button className="btn btn-primary btn-lg" onClick={submit} disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar reporte'}
            </button>
            <button className="btn btn-outline" onClick={() => setStep(4)} disabled={busy}>Volver a la lista</button>
          </div>
        )}
      </div>
    </>
  );
}

// Sub-pantalla: clase no realizada (HU-AST-03).
function NoClass({ onCancel, busy }) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('Lluvia');
  if (!showReason) {
    return <button className="btn btn-outline btn-lg" onClick={() => setShowReason(true)}>NO</button>;
  }
  return (
    <div className="card stack">
      <div className="field">
        <label>Motivo de cancelación</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option>Lluvia</option>
          <option>Festivo</option>
          <option>Otro</option>
        </select>
      </div>
      <button className="btn btn-neutral" onClick={() => onCancel(reason)} disabled={busy}>
        {busy ? 'Guardando…' : 'Confirmar cancelación'}
      </button>
    </div>
  );
}
