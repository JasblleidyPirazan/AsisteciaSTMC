import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { fmtDate } from '../utils/dates';

const STATUS_LABELS = { PRESENTE: 'P', AUSENTE: 'A', JUSTIFICADA: 'J' };
const STATUS_CLASS = { PRESENTE: 'present', AUSENTE: 'absent', JUSTIFICADA: 'justified' };

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

export default function FestivalAttendancePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [festival, setFestival] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const editing = festival && festival.status === 'REALIZADA';
  const showPay = ['ADMIN', 'SUPERADMIN'].includes(user?.role);

  useEffect(() => {
    api.get(`/festivals/${id}`)
      .then((f) => {
        setFestival(f);
        const existing = f.attendanceRecords || [];
        const byStudent = Object.fromEntries(existing.map((r) => [r.studentId, r]));
        setRecords(
          (f.makeupParticipants || []).map((p) => ({
            studentId: p.studentId,
            name: p.student?.name,
            status: byStudent[p.studentId]?.status || null,
          }))
        );
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function setStatus(studentId, status) {
    setRecords((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
  }

  async function handleFinalize() {
    setSaving(true);
    setError('');
    try {
      await api.post(`/festivals/${id}/finalize`, {
        attendanceRecords: records.map((r) => ({ studentId: r.studentId, status: r.status })),
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!festival) return <div className="page"><div className="page-content"><div className="alert alert-error">{error || 'No encontrado'}</div></div></div>;

  if (done) {
    return (
      <div className="page">
        <div className="page-content" style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: '4rem' }}>🏆</div>
          <h2 className="mt-4">{editing ? 'Reporte actualizado' : 'Reporte enviado'}</h2>
          <p className="text-gray mt-2">La asistencia del festival quedó registrada.</p>
          <button className="btn btn-primary btn-full mt-4"
            onClick={() => navigate(user?.role === 'TEACHER' ? '/' : '/admin/festivals')}>
            Volver
          </button>
        </div>
      </div>
    );
  }

  const present = records.filter((r) => r.status === 'PRESENTE').length;
  const absent = records.filter((r) => r.status === 'AUSENTE').length;
  const justified = records.filter((r) => r.status === 'JUSTIFICADA').length;
  const allMarked = records.length > 0 && records.every((r) => r.status !== null);
  const professorCount = (festival.festivalProfessors || []).length;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate(-1)}>←</button>
        <div>
          <h2>{festival.title || 'Festival'}</h2>
          <p className="text-xs text-gray">Festival · {fmtDate(festival.date)}</p>
        </div>
      </div>

      <div className="page-content">
        {error && <div className="alert alert-error mb-3">{error}</div>}
        {editing && (
          <div className="alert alert-info mb-3">
            ✏️ Este festival ya fue reportado. Estás editando — se guardará un registro y se recalculará el pago.
          </div>
        )}

        <div className="alert alert-info mb-3">
          ℹ️ Presentes y ausentes cuentan como clase para el estudiante; las
          justificadas no descuentan del paquete.
        </div>

        <div className="card mb-3">
          <div className="text-sm text-gray">
            🏫 {(festival.festivalProfessors || []).map((fp) => fp.professor?.name).join(', ')}
          </div>
          {showPay && (
            <div className="text-xs text-gray mt-2">
              Pago igualitario: {fmt(festival.festivalRate)} × {professorCount} profesor(es)
            </div>
          )}
        </div>

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

        {records.map((r) => (
          <div key={r.studentId} className="student-row">
            <div className="student-name">{r.name}</div>
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
