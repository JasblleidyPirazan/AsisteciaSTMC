import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { savePendingSession } from '../../hooks/useOffline';
import OfflineBanner from '../../components/OfflineBanner';
import Step1ClassStatus from './Step1ClassStatus';
import Step2Teacher from './Step2Teacher';
import Step3Students from './Step3Students';
import Step4Summary from './Step4Summary';

export default function AttendanceFlow() {
  const { groupId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const group = state?.group;
  const date = state?.date || new Date().toISOString().slice(0, 10);

  const [step, setStep] = useState(1);
  const [session, setSession] = useState(null);
  const [substitute, setSubstitute] = useState(null);
  const [assistant, setAssistant] = useState(null);
  const [dictatedByOwner, setDictatedByOwner] = useState(true);
  const [notDictatedNote, setNotDictatedNote] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [costs, setCosts] = useState(null);
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(true);

  // If a finalized report already exists for this group+date, switch to edit
  // mode: prefill the previous report and jump straight to the student list.
  useEffect(() => {
    if (!group) return;
    api.get('/sessions/check', { groupId, date })
      .then(({ exists, session: existing }) => {
        if (exists && ['REALIZADA', 'CANCELADA_MITAD'].includes(existing.status)) {
          setEditing(true);
          setSession(existing);
          setSubstitute(existing.substituteProfessor || null);
          setAssistant(existing.assistant || null);
          setDictatedByOwner(existing.dictatedByOwner !== false);
          setNotDictatedNote(existing.notDictatedNote || '');
          setAttendanceRecords(
            (existing.attendanceRecords || []).map((r) => ({
              studentId: r.studentId,
              name: r.student?.name,
              status: r.status,
              attendanceType: r.attendanceType,
              justification: r.justification,
            }))
          );
          setStep(3);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  if (!group) {
    navigate('/');
    return null;
  }

  async function handleClassHeld() {
    setLoading(true);
    try {
      const sess = await api.post('/sessions', {
        groupId,
        date,
        substituteProfessorId: substitute?.id || null,
        assistantId: assistant?.id || null,
      });
      setSession(sess);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(category, reasonText) {
    setLoading(true);
    try {
      const sess = await api.post('/sessions', { groupId, date });
      await api.post(`/sessions/${sess.id}/cancel`, {
        cancellationCategory: category,
        cancellationReason: reasonText || undefined,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalize() {
    setLoading(true);
    setError('');
    try {
      const payload = {
        attendanceRecords,
        substituteProfessorId: substitute?.id || null,
        assistantId: assistant?.id || null,
        dictatedByOwner,
        notDictatedNote: dictatedByOwner ? null : notDictatedNote.trim(),
      };
      let result;
      if (!navigator.onLine) {
        savePendingSession({ sessionId: session.id, payload });
        setDone(true);
        return;
      }
      result = await api.post(`/sessions/${session.id}/finalize`, payload);
      setCosts(result.costs);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="page">
        <div className="page-content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: '4rem' }}>✅</div>
          <h2 className="mt-4">{editing ? 'Reporte actualizado' : 'Reporte enviado'}</h2>
          <p className="text-gray mt-2">
            {editing
              ? 'Los cambios quedaron guardados y se registró la edición.'
              : 'La asistencia quedó registrada correctamente.'}
          </p>
          <button className="btn btn-primary btn-full mt-4" onClick={() => navigate('/')}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (checking) {
    return <div className="page"><div className="spinner" /></div>;
  }

  return (
    <div className="page">
      <OfflineBanner />
      <div className="page-header">
        <button className="nav-back" onClick={() => step === 1 || (editing && step === 2) ? navigate('/') : setStep(step - 1)}>←</button>
        <div>
          <h2>{group.code}</h2>
          <p className="text-xs text-gray">
            {editing ? 'Editando reporte' : `Paso ${step} de 4`} · {date}
          </p>
        </div>
      </div>

      {editing && (
        <div className="alert alert-info" style={{ margin: '0 20px 12px' }}>
          ✏️ Esta clase ya fue reportada. Estás editando el reporte — se guardará un
          registro de la edición y la liquidación se recalculará.
        </div>
      )}

      {error && <div className="alert alert-error" style={{ margin: '0 20px' }}>{error}</div>}

      <div className="page-content">
        {step === 1 && (
          <Step1ClassStatus
            group={group}
            onHeld={handleClassHeld}
            onCancel={handleCancel}
            loading={loading}
          />
        )}
        {step === 2 && (
          <Step2Teacher
            group={group}
            substitute={substitute}
            assistant={assistant}
            dictatedByOwner={dictatedByOwner}
            notDictatedNote={notDictatedNote}
            onSubstituteChange={setSubstitute}
            onAssistantChange={setAssistant}
            onDictatedChange={setDictatedByOwner}
            onNoteChange={setNotDictatedNote}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3Students
            groupId={groupId}
            records={attendanceRecords}
            onChange={setAttendanceRecords}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <Step4Summary
            group={group}
            session={session}
            substitute={substitute}
            assistant={assistant}
            records={attendanceRecords}
            onSubmit={handleFinalize}
            loading={loading}
            userRole={user?.role}
            editing={editing}
          />
        )}
      </div>
    </div>
  );
}
