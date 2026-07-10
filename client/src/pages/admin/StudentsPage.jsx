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

export default function StudentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Recepción only manages the payment status (Inscrito ↔ Matriculado)
  const isReception = user?.role === 'RECEPTION';
  const isAdmin = user?.role === 'ADMIN';

  // Import modal (ADMIN) — subir Excel de matrícula
  const [showImport, setShowImport] = useState(false);
  const [importB64, setImportB64] = useState('');
  const [importName, setImportName] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
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

  // Sort: 'name' or 'group'
  const [sortBy, setSortBy] = useState('name');

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
      api.get('/students', { active: 'true' }),
      api.get('/groups', { active: 'true' }),
    ]).then(([s, g]) => { setStudents(s); setGroups(g); }).finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const arr = [...students];
    if (sortBy === 'name') {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      arr.sort((a, b) => {
        const ga = a.enrollments?.[0]?.group?.code || 'zzz';
        const gb = b.enrollments?.[0]?.group?.code || 'zzz';
        if (ga !== gb) return ga.localeCompare(gb);
        return a.name.localeCompare(b.name);
      });
    }
    return arr;
  }, [students, sortBy]);

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
      // General fields — not editable by Recepción
      if (!isReception) {
        updated = await api.put(`/students/${editTarget.id}`, {
          name: editForm.name,
          email: editForm.email || null,
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
      setStudents(students.filter((s) => s.id !== deactivateTarget.id));
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

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Estudiantes</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button className="btn btn-outline" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
              onClick={openImport}>
              ⬆ Importar
            </button>
          )}
          {!isReception && (
            <button className="btn btn-primary" style={{ minHeight: 36, padding: '0 12px', fontSize: '0.875rem' }}
              onClick={() => setShowForm(true)}>
              + Nuevo
            </button>
          )}
        </div>
      </div>

      <div className="page-content">
        {/* Sort toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className={`btn ${sortBy === 'name' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, minHeight: 34, fontSize: '0.8rem' }}
            onClick={() => setSortBy('name')}
          >
            Por nombre
          </button>
          <button
            className={`btn ${sortBy === 'group' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, minHeight: 34, fontSize: '0.8rem' }}
            onClick={() => setSortBy('group')}
          >
            Por grupo
          </button>
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

        {sorted.length === 0 ? (
          <div className="alert alert-info">No hay estudiantes activos.</div>
        ) : (
          sorted.map((s) => (
            <div key={s.id} className="card mb-2">
              <div className="flex items-center justify-between">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    {STATUS_BADGE[s.studentStatus] && (
                      <span className={`badge ${STATUS_BADGE[s.studentStatus].cls}`}>
                        {STATUS_BADGE[s.studentStatus].label}
                      </span>
                    )}
                  </div>
                  {s.enrollments?.length > 0 && (
                    <div className="text-xs text-gray">
                      {s.enrollments.map((e) => e.group?.code).join(' · ')}
                    </div>
                  )}
                  <div className="text-xs text-gray">Clases adquiridas: {s.classesAcquired ?? 0}</div>
                  {s.studentStatus === 'SUSPENDIDO' && (
                    <div className="text-xs" style={{ color: 'var(--yellow)' }}>
                      Suspendido hasta {String(s.suspendedUntil).slice(0, 10)}
                      {s.suspensionReason ? ` — ${s.suspensionReason}` : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ minHeight: 32, padding: '0 8px', fontSize: '0.75rem' }}
                    onClick={() => openEdit(s)}
                  >
                    Editar
                  </button>
                  {!isReception && (
                    <>
                      <button
                        className="btn btn-ghost"
                        style={{ minHeight: 32, padding: '0 8px', fontSize: '0.75rem', color: 'var(--primary)' }}
                        onClick={() => openManageGroups(s)}
                      >
                        Grupos
                      </button>
                      {s.studentStatus === 'SUSPENDIDO' ? (
                        <button
                          className="btn btn-ghost"
                          style={{ minHeight: 32, padding: '0 8px', fontSize: '0.75rem', color: 'var(--green)' }}
                          onClick={() => handleUnsuspend(s)}
                        >
                          Levantar
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          style={{ minHeight: 32, padding: '0 8px', fontSize: '0.75rem', color: 'var(--yellow)' }}
                          onClick={() => openSuspend(s)}
                        >
                          Suspender
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        style={{ minHeight: 32, padding: '0 8px', fontSize: '0.75rem', color: 'var(--red)' }}
                        onClick={() => openDeactivate(s)}
                      >
                        Desactivar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit modal */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3">Editar estudiante</h3>
            {editError && <div className="alert alert-error">{editError}</div>}
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input type="text" className="form-input" required maxLength={200} disabled={isReception}
                  value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" maxLength={254} disabled={isReception}
                  value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Clases adquiridas</label>
                <input type="number" className="form-input" min={0} disabled={isReception}
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
                <div className="text-xs text-gray mt-2">
                  Revisa que los números cuadren y luego presiona <strong>Importar</strong>.
                </div>
              </div>
            )}

            {importResult && (
              <div className="alert alert-success">
                ✅ Importación completa: {importResult.result.created} creados,{' '}
                {importResult.result.updated} actualizados, {importResult.result.moved} cambios de grupo.
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
