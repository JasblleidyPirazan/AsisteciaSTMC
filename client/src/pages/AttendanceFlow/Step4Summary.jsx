import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import CostSummary from '../../components/CostSummary';

const STATUS_COLORS = { PRESENTE: 'badge-green', AUSENTE: 'badge-red', JUSTIFICADA: 'badge-yellow' };

export default function Step4Summary({ group, session, substitute, assistant, records,
  onSubmit, loading, userRole, editing }) {

  const [rates, setRates] = useState({});
  const effectiveUnits = 1.0;

  useEffect(() => {
    if (['ADMIN', 'TEACHER'].includes(userRole)) {
      api.get('/config/rates').then(setRates).catch(() => {});
    }
  }, [userRole]);

  // Late report warning: reporting after the class date suspends the pay
  const sessionDate = session?.date ? String(session.date).slice(0, 10) : null;
  const todayStr = new Date().toLocaleDateString('en-CA');
  const isLateReport = !editing && sessionDate && sessionDate < todayStr;

  const present = records.filter((r) => r.status === 'PRESENTE').length;
  const absent = records.filter((r) => r.status === 'AUSENTE').length;
  const justified = records.filter((r) => r.status === 'JUSTIFICADA').length;
  const regularPresent = records.filter((r) => r.status === 'PRESENTE' && r.attendanceType !== 'REPOSICION').length;
  const repositionPresent = records.filter((r) => r.status === 'PRESENTE' && r.attendanceType === 'REPOSICION').length;
  const showCosts = ['ADMIN', 'TEACHER'].includes(userRole);
  const professorName = (substitute || group.professor)?.name;

  return (
    <div>
      <h2 className="mb-2">Resumen</h2>
      <p className="text-gray text-sm mb-4">Revisa antes de enviar el reporte</p>

      {isLateReport && (
        <div className="alert alert-error mb-3">
          ⚠️ Este reporte es tardío (la clase no se reportó el mismo día). El pago
          quedará <strong>suspendido</strong> hasta que el administrador lo desbloquee.
        </div>
      )}

      {/* Group info */}
      <div className="card mb-3">
        <div className="font-medium mb-1">{group.code}</div>
        <div className="text-sm text-gray">
          {group.startTime}–{group.endTime} · Profesor: {professorName || '—'}
        </div>
        {assistant && <div className="text-sm text-gray">Asistente: {assistant.name}</div>}
      </div>

      {/* Stats */}
      <div className="stats-row mb-3">
        <div className="stat-box stat-present"><div className="num">{present}</div><div className="lbl">Presentes</div></div>
        <div className="stat-box stat-absent"><div className="num">{absent}</div><div className="lbl">Ausentes</div></div>
        <div className="stat-box stat-justified"><div className="num">{justified}</div><div className="lbl">Justificadas</div></div>
      </div>

      {/* Detail */}
      <div className="card mb-3">
        <h3 className="mb-2">Detalle</h3>
        {records.map((r) => (
          <div key={r.studentId} className="flex items-center justify-between" style={{ padding: '6px 0' }}>
            <span className="text-sm">
              {r.name}
              {r.attendanceType === 'REPOSICION' && (
                <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: '0.65rem' }}>repo</span>
              )}
            </span>
            <span className={`badge ${STATUS_COLORS[r.status]}`}>{r.status}</span>
          </div>
        ))}
      </div>

      {/* Cost calculation (only for admin/teacher) */}
      {showCosts && (
        <CostSummary
          regularPresent={regularPresent}
          repositionPresent={repositionPresent}
          effectiveUnits={effectiveUnits}
          rates={rates}
          assistantRate={assistant ? parseFloat(rates.assistant_fixed_rate || 12000) : null}
          professorName={professorName}
        />
      )}

      <div className="action-bar">
        <button
          className="btn btn-primary btn-full btn-lg"
          onClick={onSubmit}
          disabled={loading}
        >
          {loading ? 'Enviando...' : editing ? '💾 Guardar cambios' : '✅ Enviar reporte'}
        </button>
      </div>
      <div style={{ height: 72 }} />
    </div>
  );
}
