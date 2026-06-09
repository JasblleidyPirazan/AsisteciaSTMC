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
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [cancelledHalf, setCancelledHalf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [costs, setCosts] = useState(null);

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

  async function handleCancel(reason) {
    setLoading(true);
    try {
      const sess = await api.post('/sessions', { groupId, date });
      await api.post(`/sessions/${sess.id}/cancel`, { cancellationReason: reason });
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
      const payload = { attendanceRecords, cancelledHalf };
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
          <h2 className="mt-4">Reporte enviado</h2>
          <p className="text-gray mt-2">La asistencia quedó registrada correctamente.</p>
          <button className="btn btn-primary btn-full mt-4" onClick={() => navigate('/')}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <OfflineBanner />
      <div className="page-header">
        <button className="nav-back" onClick={() => step === 1 ? navigate('/') : setStep(step - 1)}>←</button>
        <div>
          <h2>{group.code}</h2>
          <p className="text-xs text-gray">Paso {step} de 4 · {date}</p>
        </div>
      </div>

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
            onSubstituteChange={setSubstitute}
            onAssistantChange={setAssistant}
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
            cancelledHalf={cancelledHalf}
            onCancelledHalfChange={setCancelledHalf}
            onSubmit={handleFinalize}
            loading={loading}
            userRole={user?.role}
          />
        )}
      </div>
    </div>
  );
}
