import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

const STATUS_BADGE = {
  MATRICULADO: { cls: 'badge-green', label: 'Matriculado' },
  INSCRITO: { cls: 'badge-blue', label: 'Inscrito' },
  SUSPENDIDO: { cls: 'badge-yellow', label: 'Suspendido' },
  INACTIVO: { cls: 'badge-gray', label: 'Inactivo' },
};

const BALL_COLOR = { Roja: '#E8526A', Naranja: '#EA8A2E', Verde: '#1FA971', Amarilla: '#E8A23B' };
const AVATAR_COLORS = ['#3F52A8', '#4F9FB2', '#7A5AF8', '#E8A23B', '#1FA971', '#E8526A', '#6F7BA6'];

function initials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·';
}
function colorFor(str) {
  let h = 0;
  for (const c of String(str || '')) h = (h + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}
function primaryEnrollment(s) {
  return s.enrollments?.find((e) => e.enrollmentType === 'PRIMARY') || s.enrollments?.[0] || null;
}
function groupedByCode(list) {
  const out = {};
  for (const s of list) {
    const code = primaryEnrollment(s)?.group?.code || 'Sin grupo';
    (out[code] ||= []).push(s);
  }
  return out;
}
const HISTORY_BADGE = {
  PRESENTE: ['badge-green', 'Presente'],
  AUSENTE: ['badge-red', 'Ausente'],
  JUSTIFICADA: ['badge-blue', 'Justificado'],
};
function historyBadge(t) {
  if (t.studentStatus === 'CANCELADA') {
    return <span className="badge badge-gray">Cancelado{t.cancellationCategory === 'LLUVIA' ? ' por lluvia' : ''}</span>;
  }
  const m = HISTORY_BADGE[t.studentStatus];
  return m ? <span className={`badge ${m[0]}`}>{m[1]}</span> : <span className="badge badge-gray">—</span>;
}
function ageFrom(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b)) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}
function fmtDay(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function fmtFullDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function fmtCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}
const PAYMENT_METHODS = [
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'WOMPI', label: 'Wompi' },
  { value: 'BOLD', label: 'Bold' },
];
const PAYMENT_METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

export default function StudentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isReception = user?.role === 'RECEPTION';
  const isAdmin = user?.role === 'ADMIN';
  // Gestión avanzada (suspender / desactivar / grupos): ADMIN / SUPERADMIN / Coordinador.
  const canManage = ['ADMIN', 'SUPERADMIN', 'PHYSICAL_TRAINER'].includes(user?.role);
  // Crear y editar datos básicos: la anterior + Recepción.
  const canEdit = canManage || isReception;
  const canImport = canManage;                        // importar Excel (no Recepción)
  // Registro de pagos: solo Recepción, Admin y Superadmin.
  const canSeePayments = ['ADMIN', 'SUPERADMIN', 'RECEPTION'].includes(user?.role);
  const canDeletePayment = ['ADMIN', 'SUPERADMIN'].includes(user?.role);

  // Import modal (ADMIN) — subir Excel de matrícula
  const [showImport, setShowImport] = useState(false);
  const [importB64, setImportB64] = useState('');
  const [importName, setImportName] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', document: '', phone: '', guardianName: '', birthDate: '', primaryGroupId: '', secondaryGroupId: '', classesAcquired: '', paymentComplete: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState(null); // student object
  const [editForm, setEditForm] = useState({ name: '', email: '', classesAcquired: '', paymentComplete: false });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Suspension modal
  const [suspendTarget, setSuspendTarget] = useState(null); // student object
  const [suspendForm, setSuspendForm] = useState({ from: '', until: '', reason: '' });
  const [suspendError, setSuspendError] = useState('');
  const [suspendSaving, setSuspendSaving] = useState(false);

  // Sort: 'name' | 'group' | 'attendance'
  const [sortBy, setSortBy] = useState('name');
  // Búsqueda y filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVOS');
  const [groupFilter, setGroupFilter] = useState('');
  const [attendance, setAttendance] = useState({});
  const [semester, setSemester] = useState(null);

  // Ficha del estudiante (modal de detalle)
  const [detailTarget, setDetailTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [prevAmount, setPrevAmount] = useState('');
  const [prevSaving, setPrevSaving] = useState(false);

  // Registro de pagos (dentro de la ficha)
  const [payments, setPayments] = useState(null);
  const emptyPayForm = { paymentDate: new Date().toISOString().slice(0, 10), method: 'TRANSFERENCIA', amount: '', note: '' };
  const [payForm, setPayForm] = useState(emptyPayForm);
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState('');

  // Deactivation modal
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  // Group management modal
  const [manageTarget, setManageTarget] = useState(null); // student object
  const [groupAction, setGroupAction] = useState('transfer'); // 'transfer' | 'add'
  const [fromGroupId, setFromGroupId] = useState('');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [groupReason, setGroupReason] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/students', { active: 'false' }),          // todos (activos e inactivos)
      api.get('/groups', { active: 'true' }),
      api.get('/students/attendance-summary').catch(() => ({})),
      api.get('/semesters/active').catch(() => null),
    ]).then(([s, g, att, sem]) => { setStudents(s); setGroups(g); setAttendance(att || {}); setSemester(sem); }).finally(() => setLoading(false));
  }, []);

  // Resumen por estado (tarjeta superior)
  const summary = useMemo(() => {
    const c = { total: students.length, activos: 0, matriculados: 0, suspendidos: 0, inactivos: 0 };
    for (const s of students) {
      if (s.studentStatus === 'INACTIVO') c.inactivos++;
      else {
        c.activos++;
        if (s.studentStatus === 'MATRICULADO') c.matriculados++;
        else if (s.studentStatus === 'SUSPENDIDO') c.suspendidos++;
      }
    }
    return c;
  }, [students]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = students.filter((s) => {
      if (statusFilter === 'ACTIVOS' && s.studentStatus === 'INACTIVO') return false;
      if (statusFilter !== 'ACTIVOS' && statusFilter !== 'TODOS' && s.studentStatus !== statusFilter) return false;
      if (groupFilter && !s.enrollments?.some((e) => e.group?.id === groupFilter)) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const rate = (s) => attendance[s.id]?.rate ?? -1;
    arr.sort((a, b) => {
      if (sortBy === 'attendance') return rate(b) - rate(a) || a.name.localeCompare(b.name);
      if (sortBy === 'group') {
        const ga = primaryEnrollment(a)?.group?.code || 'zzz';
        const gb = primaryEnrollment(b)?.group?.code || 'zzz';
        if (ga !== gb) return ga.localeCompare(gb);
      }
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [students, search, statusFilter, groupFilter, sortBy, attendance]);

  function openDetail(s) {
    setDetailTarget(s); setDetail(null); setDetailLoading(true); setPrevAmount('');
    api.get(`/students/${s.id}/report`)
      .then(setDetail).catch(() => setDetail({ error: true })).finally(() => setDetailLoading(false));
    if (canSeePayments) {
      setPayments(null); setPayForm(emptyPayForm); setPayError('');
      api.get(`/students/${s.id}/payments`).then(setPayments).catch(() => setPayments({ error: true }));
    }
  }

  async function addPayment(e) {
    e.preventDefault();
    setPayError('');
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) { setPayError('Ingresa un valor válido'); return; }
    setPaySaving(true);
    try {
      await api.post(`/students/${detailTarget.id}/payments`, {
        paymentDate: payForm.paymentDate,
        method: payForm.method,
        amount: parseFloat(payForm.amount),
        note: payForm.note || null,
      });
      const data = await api.get(`/students/${detailTarget.id}/payments`);
      setPayments(data); setPayForm(emptyPayForm);
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPaySaving(false);
    }
  }

  async function deletePayment(paymentId) {
    if (!confirm('¿Eliminar este pago?')) return;
    try {
      await api.delete(`/students/${detailTarget.id}/payments/${paymentId}`);
      const data = await api.get(`/students/${detailTarget.id}/payments`);
      setPayments(data);
    } catch (err) {
      alert(err.message);
    }
  }

  async function addPreviousClasses() {
    const amount = parseInt(prevAmount, 10);
    if (!Number.isFinite(amount) || amount === 0) return;
    setPrevSaving(true);
    try {
      const updated = await api.post(`/students/${detailTarget.id}/previous-classes`, { amount });
      setStudents(students.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
      const rep = await api.get(`/students/${detailTarget.id}/report`);
      setDetail(rep); setPrevAmount('');
    } catch (err) { alert(err.message); } finally { setPrevSaving(false); }
  }

  function StudentRow({ s }) {
    const pe = primaryEnrollment(s);
    const g = pe?.group;
    const secondaries = (s.enrollments?.length || 0) - (pe ? 1 : 0);
    const rate = attendance[s.id]?.rate;
    return (
      <div className="card card-tap mb-2" onClick={() => openDetail(s)}>
        <div className="flex items-center gap-3">
          <span className="avatar" style={{ background: colorFor(s.name) }}>{initials(s.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              <span className="font-medium">{s.name}</span>
              {STATUS_BADGE[s.studentStatus] && (
                <span className={`badge ${STATUS_BADGE[s.studentStatus].cls}`}>{STATUS_BADGE[s.studentStatus].label}</span>
              )}
            </div>
            <div className="text-xs text-gray" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {g?.code || 'Sin grupo'}{secondaries > 0 ? ` +${secondaries}` : ''}{g?.professor?.name ? ` · ${g.professor.name}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            {rate != null && (
              <span className="font-medium text-sm" style={{ color: rate >= 90 ? 'var(--green)' : rate >= 75 ? 'var(--yellow)' : 'var(--red)' }}>{rate}%</span>
            )}
            {g?.ballLevel && <span className="legend-dot" style={{ background: BALL_COLOR[g.ballLevel] || 'var(--gray-400)' }} />}
          </div>
        </div>
      </div>
    );
  }

  async function exportStudents() {
    setExporting(true);
    try {
      const token = localStorage.getItem('stmc_token');
      const base = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${base}/students/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'estudiantes.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  }

  function openImport() {
    setShowImport(true);
    setImportB64(''); setImportName('');
    setImportPreview(null); setImportResult(null); setImportError('');
  }

  function onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportName(file.name);
    setImportPreview(null); setImportResult(null); setImportError('');
    const reader = new FileReader();
    reader.onload = () => setImportB64(String(reader.result).split(',')[1] || '');
    reader.onerror = () => setImportError('No se pudo leer el archivo');
    reader.readAsDataURL(file);
  }

  async function runImport(dryRun) {
    if (!importB64) { setImportError('Selecciona un archivo .xlsx'); return; }
    setImportBusy(true); setImportError('');
    try {
      const data = await api.post('/students/import', { fileBase64: importB64, dryRun });
      if (dryRun) { setImportPreview(data); setImportResult(null); }
      else {
        setImportResult(data);
        const s = await api.get('/students', { active: 'true' });
        setStudents(s);
      }
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportBusy(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const s = await api.post('/students', form);
      setStudents([...students, s]);
      setShowForm(false);
      setForm({ name: '', email: '', document: '', phone: '', guardianName: '', birthDate: '', primaryGroupId: '', secondaryGroupId: '', classesAcquired: '', paymentComplete: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(student) {
    setEditTarget(student);
    setEditForm({
      name: student.name,
      email: student.email || '',
      document: student.document || '',
      phone: student.phone || '',
      guardianName: student.guardianName || '',
      birthDate: student.birthDate ? String(student.birthDate).slice(0, 10) : '',
      classesAcquired: student.classesAcquired != null ? String(student.classesAcquired) : '',
      paymentComplete: !!student.paymentComplete,
    });
    setEditError('');
  }

  async function handleEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    setEditError('');
    try {
      let updated = editTarget;
      // General fields — solo si tiene permiso de editar estudiantes
      if (canEdit) {
        updated = await api.put(`/students/${editTarget.id}`, {
          name: editForm.name,
          email: editForm.email || null,
          document: editForm.document || null,
          phone: editForm.phone || null,
          guardianName: editForm.guardianName || null,
          birthDate: editForm.birthDate || null,
          classesAcquired: parseInt(editForm.classesAcquired) || 0,
        });
      }
      // Payment status (Admin y Recepción) via its dedicated endpoint
      if (editForm.paymentComplete !== !!editTarget.paymentComplete && user?.role !== 'PHYSICAL_TRAINER') {
        updated = await api.patch(`/students/${editTarget.id}/payment-status`, {
          paymentComplete: editForm.paymentComplete,
        });
      }
      setStudents(students.map((s) => (s.id === editTarget.id ? { ...s, ...updated } : s)));
      setEditTarget(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  function openSuspend(student) {
    setSuspendTarget(student);
    setSuspendForm({ from: '', until: '', reason: '' });
    setSuspendError('');
  }

  async function handleSuspend(e) {
    e.preventDefault();
    setSuspendSaving(true);
    setSuspendError('');
    try {
      const updated = await api.post(`/students/${suspendTarget.id}/suspend`, suspendForm);
      setStudents(students.map((s) => (s.id === suspendTarget.id ? { ...s, ...updated } : s)));
      setSuspendTarget(null);
    } catch (err) {
      setSuspendError(err.message);
    } finally {
      setSuspendSaving(false);
    }
  }

  async function handleUnsuspend(student) {
    if (!confirm(`¿Levantar la suspensión de ${student.name}?`)) return;
    try {
      const updated = await api.post(`/students/${student.id}/unsuspend`, {});
      setStudents(students.map((s) => (s.id === student.id ? { ...s, ...updated } : s)));
    } catch (err) {
      alert(err.message);
    }
  }

  function openDeactivate(student) {
    setDeactivateTarget(student);
    setDeactivateReason('');
  }

  async function confirmDeactivate() {
    if (!deactivateReason.trim()) return;
    setDeactivating(true);
    try {
      await api.delete(`/students/${deactivateTarget.id}`, { reason: deactivateReason.trim() });
      setStudents(students.map((s) => (s.id === deactivateTarget.id ? { ...s, active: false, studentStatus: 'INACTIVO' } : s)));
      setDeactivateTarget(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setDeactivating(false);
    }
  }

  function openManageGroups(student) {
    setManageTarget(student);
    setGroupAction('transfer');
    setFromGroupId(student.enrollments?.[0]?.group?.id || '');
    setTargetGroupId('');
    setGroupReason('');
    setGroupError('');
  }

  async function handleGroupAction() {
    if (!targetGroupId) { setGroupError('Selecciona el grupo de destino'); return; }
    setGroupSaving(true);
    setGroupError('');
    try {
      let updated;
      if (groupAction === 'transfer') {
        updated = await api.post(`/students/${manageTarget.id}/transfer`, {
          fromGroupId: fromGroupId || undefined,
          toGroupId: targetGroupId,
          reason: groupReason || undefined,
        });
      } else {
        await api.post(`/students/${manageTarget.id}/enrollments`, {
          groupId: targetGroupId,
          enrollmentType: 'SECONDARY',
        });
        updated = await api.get(`/students/${manageTarget.id}`);
      }
      setStudents(students.map((s) => (s.id === manageTarget.id ? { ...s, ...updated } : s)));
      setManageTarget(null);
    } catch (err) {
      setGroupError(err.message);
    } finally {
      setGroupSaving(false);
    }
  }

  async function handleRemoveGroup(studentId, groupId) {
    if (!confirm('¿Quitar al estudiante de este grupo?')) return;
    try {
      await api.delete(`/students/${studentId}/enrollments/${groupId}`);
      setStudents(students.map((s) =>
        s.id === studentId
          ? { ...s, enrollments: s.enrollments.filter((e) => e.group?.id !== groupId) }
          : s
      ));
    } catch (err) {
      alert(err.message);
    }
  }

  function renderDetail() {
    if (detailLoading || !detail) return <div className="spinner" />;
    if (detail.error) return <div className="alert alert-error">No se pudo cargar la ficha.</div>;
    const st = detail.student;
    const sum = detail.summary;
    const g = primaryEnrollment(st)?.group;
    const age = ageFrom(st.birthDate);
    const totalClasses = (st.classesAcquired || 0) + (st.previousClasses || 0);
    const wa = String(st.phone || '').replace(/\D/g, '');
    return (
      <>
        <div className="flex items-center gap-3 mb-3">
          <span className="avatar" style={{ width: 52, height: 52, fontSize: '1rem', background: colorFor(st.name) }}>{initials(st.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              <h3>{st.name}</h3>
              {STATUS_BADGE[st.studentStatus] && <span className={`badge ${STATUS_BADGE[st.studentStatus].cls}`}>{STATUS_BADGE[st.studentStatus].label}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
              {g?.ballLevel && <span className="chip"><span className="legend-dot" style={{ background: BALL_COLOR[g.ballLevel] || 'var(--gray-400)' }} /> {g.ballLevel}{g.subLevel || ''}</span>}
              {g?.code && <span className="chip">{g.code}</span>}
              {g?.professor?.name && <span className="chip">{g.professor.name}</span>}
              {age != null && <span className="chip">{age} años</span>}
            </div>
          </div>
        </div>

        <div className="text-sm text-gray mb-1">
          {st.guardianName && <>Acudiente: <strong>{st.guardianName}</strong></>}
          {st.phone && <> · 📞 {st.phone}</>}
        </div>
        <div className="text-xs text-gray mb-3">
          {st.email && <>✉️ {st.email}</>}
          {primaryEnrollment(st)?.enrolledAt && <> · Ingreso {fmtFullDate(primaryEnrollment(st).enrolledAt)}</>}
        </div>

        <div className="flex gap-2 mb-3">
          {wa && <a className="btn btn-success" style={{ flex: 1 }} href={`https://wa.me/57${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>}
          {st.email && <a className="btn btn-outline" style={{ flex: 1 }} href={`mailto:${st.email}`}>Enviar correo</a>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: 8 }} className="mb-3">
          <div className="stat-box"><div className="num">{totalClasses}</div><div className="lbl">Clases adquiridas</div></div>
          <div className="stat-box"><div className="num">{sum.attendanceRate != null ? `${sum.attendanceRate}%` : '—'}</div><div className="lbl">Asistencia · {sum.classesSeen} clases</div></div>
          <div className="stat-box"><div className="num" style={{ color: 'var(--red)' }}>{sum.absent}</div><div className="lbl">Faltas</div></div>
          <div className="stat-box"><div className="num" style={{ color: 'var(--blue)' }}>{sum.cancelledRain}</div><div className="lbl">Canceladas · lluvia</div></div>
        </div>

        {isAdmin && (
          <div className="card mb-3" style={{ background: 'var(--surface-2)' }}>
            <div className="text-sm font-medium">Clases de semestre anterior</div>
            <div className="text-xs text-gray mb-2">Se suman a las adquiridas ({st.classesAcquired} de este semestre + {st.previousClasses} previas).</div>
            <div className="flex gap-2">
              <input type="number" className="form-input" style={{ maxWidth: 130 }} placeholder="Ej: 8"
                value={prevAmount} onChange={(e) => setPrevAmount(e.target.value)} />
              <button className="btn btn-primary" onClick={addPreviousClasses} disabled={prevSaving || !prevAmount}>
                {prevSaving ? '...' : 'Sumar'}
              </button>
            </div>
          </div>
        )}

        {canSeePayments && (
          <div className="card mb-3">
            <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: 6 }}>
              <h3>Registro de pagos</h3>
              {payments && !payments.error && (
                <span className="badge badge-green">{fmtCOP(payments.total)} · {payments.count} pago{payments.count !== 1 ? 's' : ''}</span>
              )}
            </div>

            {payError && <div className="alert alert-error mb-2">{payError}</div>}

            {/* Nuevo pago */}
            <form onSubmit={addPayment} className="mb-3">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">Fecha de pago</label>
                  <input type="date" className="form-input" required value={payForm.paymentDate}
                    onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">Medio de pago</label>
                  <select className="form-input form-select" value={payForm.method}
                    onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">Valor</label>
                  <input type="number" className="form-input" min={0} step={1000} required placeholder="Ej: 120000"
                    value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">Nota (opcional)</label>
                  <input type="text" className="form-input" maxLength={200} placeholder="Ref, concepto…"
                    value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={paySaving}>
                {paySaving ? 'Registrando…' : '＋ Registrar pago'}
              </button>
            </form>

            {/* Historial de pagos */}
            {!payments ? (
              <div className="spinner" />
            ) : payments.error ? (
              <div className="alert alert-error">No se pudieron cargar los pagos.</div>
            ) : payments.payments.length === 0 ? (
              <div className="text-sm text-gray">Sin pagos registrados.</div>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {payments.payments.map((p) => (
                  <div key={p.id} className="home-list-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="text-sm font-medium">{fmtCOP(p.amount)} <span className="badge badge-gray" style={{ fontSize: '0.66rem' }}>{PAYMENT_METHOD_LABEL[p.method] || p.method}</span></div>
                      <div className="text-xs text-gray">
                        {fmtFullDate(p.paymentDate)}{p.receivedByName ? ` · recibió ${p.receivedByName}` : ''}{p.note ? ` · ${p.note}` : ''}
                      </div>
                    </div>
                    {canDeletePayment && (
                      <button className="btn btn-ghost" style={{ minHeight: 26, padding: '0 6px', fontSize: '0.7rem', color: 'var(--red)' }}
                        onClick={() => deletePayment(p.id)}>Eliminar</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: 6 }}>
          <h3>Historial de asistencia</h3>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <span className="badge badge-green">{sum.present} Presente</span>
            <span className="badge badge-red">{sum.absent} Ausente</span>
            <span className="badge badge-gray">{sum.cancelledRain} Lluvia</span>
            <span className="badge badge-blue">{sum.justified} Justif.</span>
          </div>
        </div>
        <div className="card" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {detail.timeline.length === 0 ? <div className="text-sm text-gray">Sin registros.</div> : detail.timeline.map((t, i) => (
            <div key={i} className="home-list-row">
              <span className="text-sm text-gray" style={{ width: 56 }}>{fmtDay(t.date)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-sm font-medium">{t.groupCode} <span className="text-xs text-gray">{t.kind === 'MAKEUP' ? 'Reposición' : t.kind === 'FESTIVAL' ? 'Festival' : 'Regular'}</span></div>
                <div className="text-xs text-gray">{t.professor}</div>
              </div>
              {historyBadge(t)}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
          {canEdit && <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { const s = detailTarget; openEdit(s); }}>Editar</button>}
          {canManage && <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { const s = detailTarget; openManageGroups(s); }}>Grupos</button>}
          {canManage && st.studentStatus === 'SUSPENDIDO' && <button className="btn btn-outline" style={{ flex: 1, color: 'var(--green)' }} onClick={() => handleUnsuspend(detailTarget)}>Levantar</button>}
          {canManage && st.studentStatus !== 'SUSPENDIDO' && st.studentStatus !== 'INACTIVO' && <button className="btn btn-outline" style={{ flex: 1, color: 'var(--yellow)' }} onClick={() => openSuspend(detailTarget)}>Suspender</button>}
          {canManage && st.active && <button className="btn btn-outline" style={{ flex: 1, color: 'var(--red)' }} onClick={() => openDeactivate(detailTarget)}>Desactivar</button>}
        </div>
      </>
    );
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page page-wide">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <div style={{ flex: 1 }}>
          <h1>Estudiantes</h1>
          <p className="text-xs text-gray">{summary.activos} estudiantes{semester ? ` · ${semester.name}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
            onClick={exportStudents} disabled={exporting}>
            {exporting ? '...' : '⬇ Exportar'}
          </button>
          {canImport && (
            <button className="btn btn-outline" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
              onClick={openImport}>
              ⬆ Importar
            </button>
          )}
          {canEdit && (
            <button className="btn btn-primary" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
              onClick={() => setShowForm(true)}>
              + Nuevo
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        {/* Resumen por estado */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }} className="mb-3">
          <div className="stat-box"><div className="num">{summary.total}</div><div className="lbl">Total</div></div>
          <div className="stat-box"><div className="num" style={{ color: 'var(--blue)' }}>{summary.activos}</div><div className="lbl">Activos</div></div>
          <div className="stat-box"><div className="num" style={{ color: 'var(--green)' }}>{summary.matriculados}</div><div className="lbl">Matriculados</div></div>
          <div className="stat-box"><div className="num" style={{ color: 'var(--yellow)' }}>{summary.suspendidos}</div><div className="lbl">Suspendidos</div></div>
          <div className="stat-box"><div className="num" style={{ color: 'var(--gray-400)' }}>{summary.inactivos}</div><div className="lbl">Inactivos</div></div>
        </div>

        <div className="students-layout">
        <div className="students-list">
        {/* Búsqueda */}
        <input className="form-input mb-2" placeholder="🔎 Buscar estudiante..." value={search}
          onChange={(e) => setSearch(e.target.value)} />

        {/* Filtros */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select className="form-input form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ACTIVOS">Activos</option>
            <option value="TODOS">Todos</option>
            <option value="MATRICULADO">Matriculados</option>
            <option value="INSCRITO">Inscritos</option>
            <option value="SUSPENDIDO">Suspendidos</option>
            <option value="INACTIVO">Inactivos</option>
          </select>
          <select className="form-input form-select" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">Todos los grupos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray">{visible.length} de {students.length}</span>
          <select className="form-input form-select" style={{ minHeight: 34, width: 'auto', fontSize: '0.85rem' }}
            value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Nombre</option>
            <option value="group">Grupo</option>
            <option value="attendance">% Asistencia</option>
          </select>
        </div>

        {showForm && (
          <div className="card mb-4">
            <h3 className="mb-3">Nuevo estudiante</h3>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input type="text" className="form-input" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Documento</label>
                  <input type="text" className="form-input" value={form.document} maxLength={40}
                    onChange={(e) => setForm({ ...form, document: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp</label>
                  <input type="text" className="form-input" value={form.phone} maxLength={40}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Acudiente</label>
                <input type="text" className="form-input" value={form.guardianName} maxLength={200}
                  onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de nacimiento</label>
                <input type="date" className="form-input" value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Grupo principal</label>
                <select className="form-input form-select" value={form.primaryGroupId}
                  onChange={(e) => setForm({ ...form, primaryGroupId: e.target.value })}>
                  <option value="">Sin grupo</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Grupo secundario (opcional)</label>
                <select className="form-input form-select" value={form.secondaryGroupId}
                  onChange={(e) => setForm({ ...form, secondaryGroupId: e.target.value })}>
                  <option value="">Sin grupo</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Clases adquiridas</label>
                <input type="number" className="form-input" min={0} placeholder="Ej: 40"
                  value={form.classesAcquired}
                  onChange={(e) => setForm({ ...form, classesAcquired: e.target.value })} />
                <span className="text-xs text-gray">Total de clases que el estudiante compró para el semestre.</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.paymentComplete}
                  onChange={(e) => setForm({ ...form, paymentComplete: e.target.checked })} />
                <span className="text-sm">
                  Pago completo — <strong>Matriculado</strong>
                  <span className="text-xs text-gray" style={{ display: 'block' }}>
                    Sin marcar, el estudiante figura como Inscrito (pagos pendientes).
                  </span>
                </span>
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear estudiante'}
                </button>
              </div>
            </form>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="alert alert-info">No hay estudiantes que coincidan.</div>
        ) : sortBy === 'group' ? (
          Object.entries(groupedByCode(visible)).map(([code, list]) => (
            <div key={code} className="mb-3">
              <h3 className="mb-2" style={{ color: 'var(--gray-600)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {code} · {list.length}
              </h3>
              {list.map((s) => <StudentRow key={s.id} s={s} />)}
            </div>
          ))
        ) : (
          visible.map((s) => <StudentRow key={s.id} s={s} />)
        )}
        </div>
        <div className="students-detail">
          {detailTarget ? <div className="card">{renderDetail()}</div> : (
            <div className="card text-center text-gray" style={{ padding: 40 }}>Selecciona un estudiante para ver su ficha.</div>
          )}
        </div>
        </div>
      </div>

      {/* Ficha en modal (móvil/tablet) */}
      {detailTarget && (
        <div className="modal-overlay detail-modal" onClick={() => setDetailTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            {renderDetail()}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3">Editar estudiante</h3>
            {editError && <div className="alert alert-error">{editError}</div>}
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input type="text" className="form-input" required maxLength={200} disabled={!canEdit}
                  value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" maxLength={254} disabled={!canEdit}
                  value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Documento</label>
                  <input type="text" className="form-input" maxLength={40} disabled={!canEdit}
                    value={editForm.document} onChange={(e) => setEditForm({ ...editForm, document: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp</label>
                  <input type="text" className="form-input" maxLength={40} disabled={!canEdit}
                    value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Acudiente</label>
                <input type="text" className="form-input" maxLength={200} disabled={!canEdit}
                  value={editForm.guardianName} onChange={(e) => setEditForm({ ...editForm, guardianName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de nacimiento</label>
                <input type="date" className="form-input" disabled={!canEdit}
                  value={editForm.birthDate} onChange={(e) => setEditForm({ ...editForm, birthDate: e.target.value })} />
                {editForm.birthDate && ageFrom(editForm.birthDate) != null && (
                  <span className="text-xs text-gray">Edad: {ageFrom(editForm.birthDate)} años</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Clases adquiridas</label>
                <input type="number" className="form-input" min={0} disabled={!canEdit}
                  value={editForm.classesAcquired}
                  onChange={(e) => setEditForm({ ...editForm, classesAcquired: e.target.value })} />
                <span className="text-xs text-gray">Total de clases que el estudiante compró para el semestre.</span>
              </div>
              {user?.role !== 'PHYSICAL_TRAINER' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.paymentComplete}
                    onChange={(e) => setEditForm({ ...editForm, paymentComplete: e.target.checked })} />
                  <span className="text-sm">
                    Pago completo — <strong>Matriculado</strong>
                    <span className="text-xs text-gray" style={{ display: 'block' }}>
                      Sin marcar, el estudiante figura como Inscrito (pagos pendientes).
                    </span>
                  </span>
                </label>
              )}
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setEditTarget(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={editSaving}>
                  {editSaving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import modal (ADMIN) */}
      {showImport && (
        <div className="modal-overlay" onClick={() => !importBusy && setShowImport(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1">Importar matrícula (Excel)</h3>
            <p className="text-xs text-gray mb-3">
              Sube el archivo <strong>.xlsx</strong> de preinscripción. Se leen los estudiantes de la hoja
              «Consolidado Matrícula». Actualiza los existentes (por documento) y agrega los nuevos; no borra a nadie.
            </p>

            {importError && <div className="alert alert-error">{importError}</div>}

            <div className="form-group">
              <label className="form-label">Archivo</label>
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onImportFile} disabled={importBusy} />
              {importName && <span className="text-xs text-gray mt-1">{importName}</span>}
            </div>

            {importPreview && !importResult && (
              <div className="card mb-3" style={{ background: 'var(--surface-2)' }}>
                <div className="font-medium mb-1">Vista previa</div>
                <div className="text-sm">
                  {importPreview.counts.students} estudiantes · {importPreview.counts.groups} grupos ·{' '}
                  {importPreview.counts.professors} profesores
                </div>
                <div className="text-xs text-gray mt-1">
                  {importPreview.counts.multiGroup} con más de un grupo · Profesores: {importPreview.professors.join(', ')}
                </div>
                {importPreview.counts.payments > 0 && (
                  <div className="text-sm mt-2" style={{ color: 'var(--green)' }}>
                    💵 {importPreview.counts.payments} pagos recibidos{importPreview.paymentsTotal ? ` · ${fmtCOP(importPreview.paymentsTotal)}` : ''}
                  </div>
                )}
                <div className="text-xs text-gray mt-2">
                  Revisa que los números cuadren y luego presiona <strong>Importar</strong>.
                </div>
              </div>
            )}

            {importResult && (
              <div className="alert alert-success">
                ✅ Importación completa: {importResult.result.created} creados,{' '}
                {importResult.result.updated} actualizados, {importResult.result.moved} cambios de grupo.
                {importResult.result.paymentsCreated != null && (
                  <div className="text-sm mt-1">
                    💵 {importResult.result.paymentsCreated} pagos registrados
                    {importResult.result.paymentsSkipped > 0 ? ` · ${importResult.result.paymentsSkipped} ya existían` : ''}
                  </div>
                )}
                {importResult.warnings?.length > 0 && (
                  <div className="text-xs mt-1">Avisos: {importResult.warnings.join('; ')}</div>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                onClick={() => setShowImport(false)} disabled={importBusy}>
                {importResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {!importResult && (
                <>
                  <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                    onClick={() => runImport(true)} disabled={importBusy || !importB64}>
                    {importBusy ? '...' : 'Previsualizar'}
                  </button>
                  <button type="button" className="btn btn-primary" style={{ flex: 1 }}
                    onClick={() => runImport(false)} disabled={importBusy || !importB64}>
                    {importBusy ? 'Importando...' : 'Importar'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Suspension modal */}
      {suspendTarget && (
        <div className="modal-overlay" onClick={() => setSuspendTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1">Suspender estudiante</h3>
            <p className="text-sm text-gray mb-3">{suspendTarget.name}</p>
            <p className="text-xs text-gray mb-3">
              Retiro temporal mayor a dos semanas y menor al semestre. Mientras dure, el
              estudiante no aparece en los grupos ni en las listas de asistencia; al vencer
              la fecha de fin reaparece automáticamente.
            </p>
            {suspendError && <div className="alert alert-error mb-2">{suspendError}</div>}
            <form onSubmit={handleSuspend}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Desde *</label>
                  <input type="date" className="form-input" required value={suspendForm.from}
                    onChange={(e) => setSuspendForm({ ...suspendForm, from: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Hasta *</label>
                  <input type="date" className="form-input" required value={suspendForm.until}
                    onChange={(e) => setSuspendForm({ ...suspendForm, until: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Razón *</label>
                <textarea className="form-input" rows={2} required
                  placeholder="Ej: Lesión, intercambio, viaje..."
                  value={suspendForm.reason}
                  onChange={(e) => setSuspendForm({ ...suspendForm, reason: e.target.value })}
                  style={{ resize: 'vertical' }} />
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                  onClick={() => setSuspendTarget(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={suspendSaving}
                  style={{ flex: 2, background: 'var(--yellow)', color: '#fff' }}>
                  {suspendSaving ? 'Suspendiendo...' : 'Suspender'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivation modal */}
      {deactivateTarget && (
        <div className="modal-overlay" onClick={() => setDeactivateTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3">Desactivar estudiante</h3>
            <p className="text-sm mb-3">
              Vas a desactivar a <strong>{deactivateTarget.name}</strong>. Esta acción requiere un motivo.
            </p>
            <div className="form-group">
              <label className="form-label">Motivo *</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Ej: Retirado de la academia, se mudó de ciudad..."
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setDeactivateTarget(null)}>
                Cancelar
              </button>
              <button
                className="btn"
                style={{ flex: 2, background: 'var(--red)', color: '#fff' }}
                disabled={!deactivateReason.trim() || deactivating}
                onClick={confirmDeactivate}
              >
                {deactivating ? 'Desactivando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group management modal */}
      {manageTarget && (
        <div className="modal-overlay" onClick={() => setManageTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1">Gestionar grupos</h3>
            <p className="text-sm text-gray mb-3">{manageTarget.name}</p>

            {manageTarget.enrollments?.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray mb-1">Grupos actuales:</div>
                {manageTarget.enrollments.map((e) => (
                  <div key={e.group?.id} className="flex items-center justify-between mb-1">
                    <span className="text-sm">{e.group?.code} <span className="text-xs text-gray">({e.enrollmentType === 'PRIMARY' ? 'Principal' : 'Secundario'})</span></span>
                    <button
                      className="btn btn-ghost"
                      style={{ minHeight: 26, padding: '0 6px', fontSize: '0.7rem', color: 'var(--red)' }}
                      onClick={() => { handleRemoveGroup(manageTarget.id, e.group?.id); setManageTarget(null); }}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                className={`btn ${groupAction === 'transfer' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, minHeight: 32, fontSize: '0.8rem' }}
                onClick={() => setGroupAction('transfer')}
              >
                Cambiar grupo
              </button>
              <button
                className={`btn ${groupAction === 'add' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, minHeight: 32, fontSize: '0.8rem' }}
                onClick={() => setGroupAction('add')}
              >
                Agregar grupo
              </button>
            </div>

            {groupError && <div className="alert alert-error mb-2">{groupError}</div>}

            {groupAction === 'transfer' && (
              <div className="form-group">
                <label className="form-label">Desde grupo</label>
                <select className="form-input form-select" value={fromGroupId}
                  onChange={(e) => setFromGroupId(e.target.value)}>
                  <option value="">Grupo principal actual</option>
                  {manageTarget.enrollments?.map((e) => (
                    <option key={e.group?.id} value={e.group?.id}>{e.group?.code}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Grupo destino *</label>
              <select className="form-input form-select" value={targetGroupId}
                onChange={(e) => setTargetGroupId(e.target.value)}>
                <option value="">Seleccionar grupo</option>
                {groups
                  .filter((g) => !manageTarget.enrollments?.some((e) => e.group?.id === g.id))
                  .map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
              </select>
            </div>

            {groupAction === 'transfer' && (
              <div className="form-group">
                <label className="form-label">Motivo del cambio</label>
                <input type="text" className="form-input" placeholder="Opcional"
                  value={groupReason} onChange={(e) => setGroupReason(e.target.value)} />
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setManageTarget(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={!targetGroupId || groupSaving}
                onClick={handleGroupAction}>
                {groupSaving ? 'Guardando...' : groupAction === 'transfer' ? 'Cambiar grupo' : 'Agregar grupo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
