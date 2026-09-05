import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { fmtDate } from '../utils/dates';
import CostSummary from '../components/CostSummary';
import { StudentStatusIcon } from '../utils/studentStatus';

const STATUS_LABELS = { PRESENTE: 'P', AUSENTE: 'A', JUSTIFICADA: 'J', NO_APLICA: 'N/A' };
const STATUS_CLASS = { PRESENTE: 'present', AUSENTE: 'absent', JUSTIFICADA: 'justified', NO_APLICA: 'na' };

export default function MakeupAttendancePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [makeup, setMakeup] = useState(null);
  const [records, setRecords] = useState([]);
  const [substitute, setSubstitute] = useState(null);
  const [assistant, setAssistant] = useState(null);
  const [professors, setProfessors] = useState([]);
  const [assistants, setAssistants] = useState([]);
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null); // consolidación devuelta al enviar
  const [showCancel, setShowCancel] = useState(false);
  const [cancelCategory, setCancelCategory] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  // Doble reporte: el profesor escribe el reporte PROFESSOR, el coordinador y la
  // administración el COORDINATOR. La reposición solo se cierra cuando coinciden.
  const myReporterType = user?.role === 'TEACHER' ? 'PROFESSOR' : 'COORDINATOR';
  const myReport = (makeup?.reports || []).find((r) => r.reporterType === myReporterType);
  const otherReport = (makeup?.reports || []).find((r) => r.reporterType !== myReporterType);
  const editing = !!myReport || (makeup && ['REALIZADA', 'CANCELADA_MITAD'].includes(makeup.status));
  const showCosts = ['ADMIN', 'SUPERADMIN', 'TEACHER'].includes(user?.role);

  useEffect(() => {
    Promise.all([
      api.get(`/makeups/${id}`),
      api.get('/professors', { active: 'true' }).catch(() => []),
      api.get('/assistants', { active: 'true' }).catch(() => []),
    ]).then(([m, profs, asis]) => {
      setMakeup(m);
      setProfessors(profs);
      setAssistants(asis);
      setSubstitute(m.substituteProfessor || null);
      setAssistant(m.assistant || null);

      // Precarga: primero MI propio reporte de staging (lo que yo dije la última
      // vez); si todavía no tengo, la asistencia consolidada que hubiera.
      const mine = (m.reports || []).find(
        (r) => r.reporterType === (user?.role === 'TEACHER' ? 'PROFESSOR' : 'COORDINATOR')
      );
      const existing = mine ? mine.attendance : (m.attendanceRecords || []);
      const byStudent = Object.fromEntries(existing.map((r) => [r.studentId, r]));
      if (mine) {
        const prof = profs.find((p) => p.id === mine.dictatingProfessorId);
        if (prof) setSubstitute(prof);
        const asi = asis.find((a) => a.id === mine.assistantId);
        setAssistant(asi || null);
      }
      setRecords(
        (m.makeupParticipants || []).map((p) => ({
          studentId: p.studentId,
          name: p.student?.name,
          studentStatus: p.student?.studentStatus || null,
          missingBirthDate: !!p.student?.missingBirthDate,
          status: byStudent[p.studentId]?.status || null,
        }))
      );
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));

    if (['ADMIN', 'SUPERADMIN', 'TEACHER'].includes(user?.role)) {
      api.get('/config/rates').then(setRates).catch(() => {});
    }
  }, [id]);

  function setStatus(studentId, status) {
    setRecords((rs) => rs.map((r) => r.studentId === studentId ? { ...r, status } : r));
  }

  async function handleFinalize() {
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/makeups/${id}/finalize`, {
        attendanceRecords: records.map((r) => ({ studentId: r.studentId, status: r.status })),
        substituteProfessorId: substitute?.id || null,
        assistantId: assistant?.id || null,
        reporterType: myReporterType, // el SUPERADMIN debe decir cuál escribe
      });
      setResult(res?.consolidation || null);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setSaving(true);
    try {
      await api.post(`/makeups/${id}/cancel`, {
        cancellationCategory: cancelCategory,
        cancellationReason: cancelReason || undefined,
      });
      navigate('/admin/makeups', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!makeup) return <div className="page"><div className="page-content"><div className="alert alert-error">{error || 'No encontrada'}</div></div></div>;

  const otherRole = myReporterType === 'PROFESSOR' ? 'coordinador' : 'profesor';

  if (done) {
    // Mismo lenguaje que una clase regular: la reposición solo queda cerrada
    // (y el pago habilitado) cuando los dos reportes coinciden.
    const outcome = {
      MATCHED: { icon: '✅', title: 'Reportes coinciden', msg: 'El reporte del profesor y del coordinador coinciden: la reposición quedó consolidada y el pago habilitado.' },
      PENDING: { icon: '🕓', title: 'Reporte enviado', msg: `Falta el reporte del ${otherRole}. Cuando ambos coincidan se consolidará la reposición y se habilitará el pago.` },
      MISMATCH: { icon: '⚠️', title: 'Los reportes no coinciden', msg: `Tu reporte no coincide con el del ${otherRole}. Revisa el conflicto: ambos deben ajustar hasta que coincidan.` },
    }[result?.status] || { icon: '✅', title: editing ? 'Reporte actualizado' : 'Reporte enviado', msg: 'La asistencia de la reposición quedó registrada.' };

    return (
      <div className="page">
        <div className="page-content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: '4rem' }}>{outcome.icon}</div>
          <h2 className="mt-4">{outcome.title}</h2>
          <p className="text-gray mt-2">{outcome.msg}</p>
          <button className="btn btn-primary btn-full mt-4"
            onClick={() => navigate(user?.role === 'TEACHER' ? '/' : '/admin/makeups')}>
            Volver
          </button>
        </div>
      </div>
    );
  }

  const present = records.filter((r) => r.status === 'PRESENTE').length;
  const absent = records.filter((r) => r.status === 'AUSENTE').length;
  const justified = records.filter((r) => r.status === 'JUSTIFICADA').length;
  const regularPresent = present;
  const effectiveUnits = parseFloat(makeup.effectiveUnits);
  const allMarked = records.length > 0 && records.every((r) => r.status !== null);
  const displayProf = substitute || makeup.makeupProfessor;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate(-1)}>←</button>
        <div>
          <h2>{makeup.title || 'Reposición grupal'}</h2>
          <p className="text-xs text-gray">Reposición · {fmtDate(makeup.date)}</p>
        </div>
      </div>

      <div className="page-content">
        {error && <div className="alert alert-error mb-3">{error}</div>}
        {myReport && (
          <div className="alert alert-info mb-3">
            ✏️ Ya enviaste tu reporte. Estás editándolo — se guardará un registro de la edición.
          </div>
        )}

        {/* Estado de la doble consolidación, con las mismas reglas que una
            clase regular: sin los dos reportes no hay asistencia ni pago. */}
        {makeup.consolidationStatus === 'MISMATCH' ? (
          <div className="alert alert-error mb-3">
            ⚠️ Tu reporte y el del {otherRole} <strong>no coinciden</strong>. Ajusta hasta que digan lo mismo:
            mientras tanto la reposición no se consolida ni se habilita el pago.
          </div>
        ) : makeup.consolidationStatus === 'MATCHED' ? (
          <div className="alert alert-success mb-3">
            ✅ Los dos reportes coinciden: reposición consolidada y pago habilitado.
          </div>
        ) : otherReport ? (
          <div className="alert alert-info mb-3">
            🕓 El {otherRole} ya reportó esta reposición. Falta el tuyo para consolidarla.
          </div>
        ) : (
          <div className="alert alert-info mb-3">
            🕓 Esta reposición la reportan el profesor y el {myReporterType === 'PROFESSOR' ? 'coordinador' : 'profesor'} por separado:
            se consolida y se habilita el pago cuando los dos reportes coinciden.
          </div>
        )}

        {/* Cuántas clases recupera cada presente: lo definió el coordinador al
            programarla (sencilla = 1, doble = 2). */}
        <div className="alert alert-info mb-3">
          🔁 {effectiveUnits === 1 ? 'Reposición sencilla' : `Reposición de ${effectiveUnits} asistencias`}:
          {' '}cada estudiante presente recupera {effectiveUnits} clase{effectiveUnits === 1 ? '' : 's'} de su paquete.
        </div>

        {/* Professor */}
        <div className="card mb-3">
          <label className="form-label">Profesor</label>
          <select className="form-input form-select"
            value={substitute?.id || makeup.makeupProfessor?.id || ''}
            onChange={(e) => {
              const id = e.target.value;
              if (id === makeup.makeupProfessor?.id) setSubstitute(null);
              else setSubstitute(professors.find((p) => p.id === id) || null);
            }}>
            {makeup.makeupProfessor && (
              <option value={makeup.makeupProfessor.id}>{makeup.makeupProfessor.name} (titular)</option>
            )}
            {professors
              .filter((p) => p.id !== makeup.makeupProfessor?.id)
              .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label className="form-label mt-3">Asistente (opcional)</label>
          <select className="form-input form-select" value={assistant?.id || ''}
            onChange={(e) => setAssistant(assistants.find((a) => a.id === e.target.value) || null)}>
            <option value="">Sin asistente</option>
            {assistants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {makeup.assistant && (
            <p className="text-xs text-gray mt-1">
              🤝 {makeup.assistant.name} fue asignado por el coordinador. Si acompañó otra persona,
              cámbialo aquí: el pago del asistente quedará pendiente hasta que el coordinador lo valide.
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="stats-row mb-3">
          <div className="stat-box stat-present"><div className="num">{present}</div><div className="lbl">Presentes</div></div>
          <div className="stat-box stat-absent"><div className="num">{absent}</div><div className="lbl">Ausentes</div></div>
          <div className="stat-box stat-justified"><div className="num">{justified}</div><div className="lbl">Justificadas</div></div>
        </div>

        <div className="flex gap-2 mb-3">
          <button className="btn btn-outline" style={{ flex: 1, minHeight: 40, fontSize: '0.875rem' }}
            onClick={() => setRecords((rs) => rs.map((r) => ({ ...r, status: 'PRESENTE' })))}>
            Todos P
          </button>
          <button className="btn btn-outline" style={{ flex: 1, minHeight: 40, fontSize: '0.875rem' }}
            onClick={() => setRecords((rs) => rs.map((r) => ({ ...r, status: 'AUSENTE' })))}>
            Todos A
          </button>
        </div>

        {/* Students */}
        {records.map((r) => (
          <div key={r.studentId} className="student-row">
            <div className="student-name"><StudentStatusIcon status={r.studentStatus} missingBirthDate={r.missingBirthDate} />{r.name}</div>
            <div className="student-actions">
              {(['PRESENTE', 'AUSENTE', 'JUSTIFICADA']).map((s) => (
                <button key={s}
                  className={`att-btn ${r.status === s ? `selected ${STATUS_CLASS[s]}` : r.status ? 'dim' : ''}`}
                  aria-pressed={r.status === s}
                  onClick={() => setStatus(r.studentId, s)}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Cost */}
        {showCosts && (
          <CostSummary
            regularPresent={regularPresent}
            repositionPresent={0}
            effectiveUnits={effectiveUnits}
            rates={rates}
            assistantRate={assistant ? parseFloat(rates.assistant_fixed_rate || 12000) : null}
            professorName={displayProf?.name}
          />
        )}

        {/* Cancel */}
        {!showCancel ? (
          <button className="btn btn-ghost btn-full mt-3" style={{ color: 'var(--red)' }}
            onClick={() => setShowCancel(true)}>
            Cancelar esta reposición
          </button>
        ) : (
          <div className="card mt-3">
            <label className="form-label">Motivo de cancelación</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {[
                { category: 'LLUVIA', label: '🌧️ Cancelada por lluvia' },
                { category: 'SIN_ESTUDIANTES', label: '👥 No llegaron estudiantes' },
                { category: 'OTRA', label: '📝 Otro motivo' },
              ].map((opt) => (
                <button key={opt.category} type="button"
                  className={`btn btn-full ${cancelCategory === opt.category ? 'btn-primary' : 'btn-outline'}`}
                  style={{ justifyContent: 'flex-start', minHeight: 40 }}
                  onClick={() => setCancelCategory(opt.category)}>
                  {cancelCategory === opt.category ? '✓ ' : ''}{opt.label}
                </button>
              ))}
            </div>
            {cancelCategory === 'OTRA' && (
              <input type="text" className="form-input mb-2" value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)} placeholder="Describe el motivo..." />
            )}
            <div className="flex gap-2">
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowCancel(false)}>
                Volver
              </button>
              <button className="btn btn-danger" style={{ flex: 2 }}
                disabled={!cancelCategory || (cancelCategory === 'OTRA' && !cancelReason.trim()) || saving}
                onClick={handleCancel}>
                Confirmar cancelación
              </button>
            </div>
          </div>
        )}

        <div className="action-bar">
          <button className="btn btn-primary btn-full btn-lg" onClick={handleFinalize}
            disabled={saving || !allMarked}>
            {saving ? 'Guardando...' : editing ? '💾 Guardar cambios' : '✅ Enviar reporte'}
          </button>
        </div>
        <div style={{ height: 72 }} />
      </div>
    </div>
  );
}
