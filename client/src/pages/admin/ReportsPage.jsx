import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

const TABS = ['Grupo', 'Estudiante', 'Asistente', 'Profesor', 'Clase'];

function fmt(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

const STATUS_LABEL = { REALIZADA: 'Realizada', CANCELADA: 'Cancelada', CANCELADA_MITAD: 'Cancelada mitad', PROGRAMADA: 'Programada' };
const STATUS_COLOR = { REALIZADA: 'var(--green)', CANCELADA: 'var(--red)', CANCELADA_MITAD: 'var(--orange)', PROGRAMADA: 'var(--gray-400)' };
const ATTENDANCE_LABEL = { PRESENTE: 'P', AUSENTE: 'A', JUSTIFICADA: 'J' };
const ATTENDANCE_COLOR = { PRESENTE: 'var(--green)', AUSENTE: 'var(--red)', JUSTIFICADA: 'var(--blue)' };

export default function ReportsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [assistants, setAssistants] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const [groupId, setGroupId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [professorId, setProfessorId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [classGroupId, setClassGroupId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/groups', { active: 'true' }),
      api.get('/students', { active: 'true' }),
      api.get('/assistants', { active: 'true' }),
      api.get('/professors', { active: 'true' }),
    ]).then(([g, s, a, p]) => { setGroups(g); setStudents(s); setAssistants(a); setProfessors(p); })
      .finally(() => setLoadingLists(false));
  }, []);

  // Load sessions when a group is selected for the Clase tab
  useEffect(() => {
    if (tab === 4 && classGroupId) {
      api.get(`/reports/group/${classGroupId}`).then((data) => {
        setSessions(Array.isArray(data) ? data : []);
      }).catch(() => setSessions([]));
    } else {
      setSessions([]);
      setSessionId('');
    }
  }, [tab, classGroupId]);

  useEffect(() => {
    setData(null);
    setError('');
    setSessionId('');
    setSessions([]);
    setClassGroupId('');
  }, [tab]);

  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setData(null);
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;

      let result;
      if (tab === 0) result = await api.get(`/reports/group/${groupId}`, params);
      else if (tab === 1) result = await api.get(`/reports/student/${studentId}`, params);
      else if (tab === 2) result = await api.get(`/reports/assistant/${assistantId}`, params);
      else if (tab === 3) result = await api.get(`/reports/professor/${professorId}`, params);
      else result = await api.get(`/reports/class/${sessionId}`);

      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const canSearch =
    (tab === 0 && groupId) ||
    (tab === 1 && studentId) ||
    (tab === 2 && assistantId) ||
    (tab === 3 && professorId) ||
    (tab === 4 && sessionId);

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Reportes</h1>
      </div>

      <div className="page-content">
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {TABS.map((t, i) => (
            <button
              key={t}
              className={`btn ${tab === i ? 'btn-primary' : 'btn-outline'}`}
              style={{ minHeight: 34, fontSize: '0.78rem', padding: '0 10px' }}
              onClick={() => setTab(i)}
            >
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch}>
          {!loadingLists && (
            <div className="form-group">
              {tab === 0 && (
                <>
                  <label className="form-label">Grupo</label>
                  <select className="form-input form-select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                    <option value="">Seleccionar grupo</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
                  </select>
                </>
              )}
              {tab === 1 && (
                <>
                  <label className="form-label">Estudiante</label>
                  <select className="form-input form-select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                    <option value="">Seleccionar estudiante</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </>
              )}
              {tab === 2 && (
                <>
                  <label className="form-label">Asistente</label>
                  <select className="form-input form-select" value={assistantId} onChange={(e) => setAssistantId(e.target.value)}>
                    <option value="">Seleccionar asistente</option>
                    {assistants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </>
              )}
              {tab === 3 && (
                <>
                  <label className="form-label">Profesor</label>
                  <select className="form-input form-select" value={professorId} onChange={(e) => setProfessorId(e.target.value)}>
                    <option value="">Seleccionar profesor</option>
                    {professors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </>
              )}
              {tab === 4 && (
                <>
                  <label className="form-label">Grupo</label>
                  <select className="form-input form-select mb-2" value={classGroupId} onChange={(e) => { setClassGroupId(e.target.value); setSessionId(''); }}>
                    <option value="">Seleccionar grupo</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
                  </select>
                  {classGroupId && (
                    <>
                      <label className="form-label">Sesión</label>
                      <select className="form-input form-select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                        <option value="">Seleccionar sesión</option>
                        {sessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {fmt(s.date)} — {STATUS_LABEL[s.status]}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {tab !== 4 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Desde</label>
                <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Hasta</label>
                <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-full" disabled={!canSearch || loading}>
            {loading ? 'Consultando...' : 'Ver reporte'}
          </button>
        </form>

        {error && <div className="alert alert-error mt-3">{error}</div>}

        {data && tab === 0 && <GroupReport data={data} />}
        {data && tab === 1 && <StudentReport data={data} />}
        {data && tab === 2 && <AssistantReport data={data} />}
        {data && tab === 3 && <ProfessorReport data={data} />}
        {data && tab === 4 && <ClassReport data={data} />}
      </div>
    </div>
  );
}

function GroupReport({ data }) {
  const sessions = Array.isArray(data) ? data : [];
  const realized = sessions.filter((s) => s.status === 'REALIZADA' || s.status === 'CANCELADA_MITAD').length;
  const cancelled = sessions.filter((s) => s.status === 'CANCELADA').length;
  const avgAttendance = sessions.filter((s) => s.present !== undefined && (s.present + s.absent + s.justified) > 0);
  const avgRate = avgAttendance.length > 0
    ? Math.round(avgAttendance.reduce((sum, s) => sum + s.attendanceRate, 0) / avgAttendance.length)
    : 0;

  return (
    <div className="mt-4">
      <div className="stats-row mb-3">
        <div className="stat-box"><div className="num">{sessions.length}</div><div className="lbl">Total</div></div>
        <div className="stat-box"><div className="num">{realized}</div><div className="lbl">Realizadas</div></div>
        <div className="stat-box"><div className="num">{cancelled}</div><div className="lbl">Canceladas</div></div>
        <div className="stat-box"><div className="num">{avgRate}%</div><div className="lbl">Asistencia</div></div>
      </div>
      {sessions.map((s) => (
        <div key={s.id} className="card mb-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{fmt(s.date)}</div>
              <div className="text-xs text-gray">
                P:{s.present} A:{s.absent} J:{s.justified} · {s.attendanceRate}% asistencia
              </div>
            </div>
            <span className="badge" style={{ background: STATUS_COLOR[s.status] + '20', color: STATUS_COLOR[s.status], flexShrink: 0 }}>
              {STATUS_LABEL[s.status]}
            </span>
          </div>
        </div>
      ))}
      {sessions.length === 0 && <div className="alert alert-info">Sin sesiones en el período.</div>}
    </div>
  );
}

function StudentReport({ data }) {
  const { records = [], summary = {} } = data;
  return (
    <div className="mt-4">
      <div className="stats-row mb-3">
        <div className="stat-box"><div className="num">{summary.total || 0}</div><div className="lbl">Total</div></div>
        <div className="stat-box"><div className="num">{summary.present || 0}</div><div className="lbl">Presentes</div></div>
        <div className="stat-box"><div className="num">{summary.absent || 0}</div><div className="lbl">Ausentes</div></div>
        <div className="stat-box"><div className="num">{summary.attendanceRate || 0}%</div><div className="lbl">Asistencia</div></div>
      </div>
      {records.map((r) => (
        <div key={r.id} className="card mb-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{fmt(r.session?.date)}</div>
              <div className="text-xs text-gray">{r.session?.group?.code}</div>
              {r.justification && <div className="text-xs text-gray">{r.justification}</div>}
            </div>
            <span style={{
              fontWeight: 700, fontSize: '1rem', width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: ATTENDANCE_COLOR[r.status] + '20', color: ATTENDANCE_COLOR[r.status],
            }}>
              {ATTENDANCE_LABEL[r.status]}
            </span>
          </div>
        </div>
      ))}
      {records.length === 0 && <div className="alert alert-info">Sin registros en el período.</div>}
    </div>
  );
}

function AssistantReport({ data }) {
  const sessions = data?.sessions || [];
  return (
    <div className="mt-4">
      <div className="card mb-3">
        <div className="cost-row">
          <span>Total clases acompañadas</span>
          <span className="font-medium">{data?.total || 0}</span>
        </div>
      </div>
      {sessions.map((s) => (
        <div key={s.id} className="card mb-2">
          <div className="text-sm font-medium">{fmt(s.date)}</div>
          <div className="text-xs text-gray">{s.group?.code}</div>
        </div>
      ))}
      {sessions.length === 0 && <div className="alert alert-info">Sin sesiones en el período.</div>}
    </div>
  );
}

function ProfessorReport({ data }) {
  const { sessions = [], summary = {} } = data;
  return (
    <div className="mt-4">
      <div className="stats-row mb-3">
        <div className="stat-box"><div className="num">{summary.total || 0}</div><div className="lbl">Sesiones</div></div>
        <div className="stat-box"><div className="num">{summary.realized || 0}</div><div className="lbl">Realizadas</div></div>
        <div className="stat-box"><div className="num">{fmtCOP(summary.totalPay)}</div><div className="lbl">Total pago</div></div>
      </div>
      {sessions.map((s) => (
        <div key={s.id} className="card mb-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{fmt(s.date)} · {s.group?.code}</div>
              <div className="text-xs text-gray">
                P:{s.present} A:{s.absent} J:{s.justified}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <span className="badge" style={{ background: STATUS_COLOR[s.status] + '20', color: STATUS_COLOR[s.status] }}>
                {STATUS_LABEL[s.status]}
              </span>
              {s.pay > 0 && <div className="text-sm font-medium mt-1">{fmtCOP(s.pay)}</div>}
            </div>
          </div>
        </div>
      ))}
      {sessions.length === 0 && <div className="alert alert-info">Sin sesiones en el período.</div>}
    </div>
  );
}

function ClassReport({ data }) {
  if (!data) return null;
  const { attendanceRecords = [], group, date, status, present, absent, justified, totalCost,
    substituteProfessor, assistant } = data;

  return (
    <div className="mt-4">
      <div className="card mb-3">
        <div className="font-medium mb-1">{group?.code}</div>
        <div className="text-sm text-gray mb-2">{fmt(date)} · {STATUS_LABEL[status]}</div>
        {substituteProfessor && <div className="text-xs text-gray">Sustituto: {substituteProfessor.name}</div>}
        {assistant && <div className="text-xs text-gray">Asistente: {assistant.name}</div>}
      </div>

      <div className="stats-row mb-3">
        <div className="stat-box"><div className="num">{present}</div><div className="lbl">Presentes</div></div>
        <div className="stat-box"><div className="num">{absent}</div><div className="lbl">Ausentes</div></div>
        <div className="stat-box"><div className="num">{justified}</div><div className="lbl">Justificados</div></div>
        {totalCost > 0 && <div className="stat-box"><div className="num" style={{ fontSize: '0.9rem' }}>{fmtCOP(totalCost)}</div><div className="lbl">Costo</div></div>}
      </div>

      {attendanceRecords.map((r) => (
        <div key={r.id} className="card mb-1">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">{r.student?.name}</div>
              {r.attendanceType === 'REPOSICION' && <div className="text-xs text-gray">Reposición</div>}
            </div>
            <span style={{
              fontWeight: 700, fontSize: '0.9rem', width: 30, height: 30, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: ATTENDANCE_COLOR[r.status] + '20', color: ATTENDANCE_COLOR[r.status],
            }}>
              {ATTENDANCE_LABEL[r.status]}
            </span>
          </div>
        </div>
      ))}
      {attendanceRecords.length === 0 && <div className="alert alert-info">Sin registros de asistencia.</div>}
    </div>
  );
}
