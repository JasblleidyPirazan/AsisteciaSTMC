import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { fmtDate, bogotaTodayStr } from '../../utils/dates';
import { periodLabel, periodDatesLabel } from '../../utils/periods';
import { toast } from '../../utils/toast';
import { StudentStatusBadge, StudentStatusIcon, STUDENT_STATUS } from '../../utils/studentStatus';

// Módulo de Contabilidad (solo Admin/Superadmin):
//   Ingresos          = pagos de estudiantes, con verificación (conciliación) por pago.
//   Gastos            = liquidación a profesores/asistentes agrupada por quincena.
//   Fijos y variables = gastos operativos de la academia que no salen de las clases:
//                       fijos quincenales con vigencia (inicio/fin) y variables de
//                       una sola vez cargados a una quincena.
//   Balance           = ingresos vs gastos causados por mes (nómina + operativos).
//   Pagos Estudiantes = valor esperado del plan vs pagado, por estudiante.

function fmt(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

const METHOD_LABEL = { TRANSFERENCIA: 'Transferencia', EFECTIVO: 'Efectivo', WOMPI: 'Wompi', BOLD: 'Bold' };
const METHOD_BADGE = { TRANSFERENCIA: 'badge-blue', EFECTIVO: 'badge-green', WOMPI: 'badge-yellow', BOLD: 'badge-gray' };

// Gastos operativos: un FIJO vale lo mismo cada quincena mientras esté vigente;
// un VARIABLE es un gasto de una sola vez cargado a la quincena de su fecha.
const KIND_LABEL = { FIJO: 'Fijo', VARIABLE: 'Variable' };
const KIND_BADGE = { FIJO: 'badge-blue', VARIABLE: 'badge-yellow' };
const EXPENSE_CATEGORIES = [
  ['ARRIENDO', 'Arriendo'],
  ['SERVICIOS', 'Servicios'],
  ['NOMINA_ADMINISTRATIVA', 'Nómina administrativa'],
  ['MANTENIMIENTO', 'Mantenimiento'],
  ['IMPLEMENTOS', 'Implementos'],
  ['TRANSPORTE', 'Transporte'],
  ['MARKETING', 'Marketing'],
  ['IMPUESTOS_SEGUROS', 'Impuestos y seguros'],
  ['OTRO', 'Otro'],
];
const CATEGORY_LABEL = Object.fromEntries(EXPENSE_CATEGORIES);
const EMPTY_OPERATING = {
  rows: [], occurrences: [], byCategory: {},
  totals: { count: 0, fixedTotal: 0, variableTotal: 0, total: 0, paidTotal: 0, unpaidTotal: 0 },
};

// Límites de mes anclados al día de Bogotá (bogotaTodayStr de utils/dates).
function monthRange(offset = 0) {
  const [y, m] = bogotaTodayStr().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  const first = d.toISOString().slice(0, 10);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { from: first, to: last };
}
function dateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}
// Quincena ("YYYY-MM-1" / "YYYY-MM-2") en que cae una fecha YYYY-MM-DD.
function periodOf(ymd) {
  const [y, m, d] = String(ymd).split('-');
  return `${y}-${m}-${Number(d) <= 15 ? '1' : '2'}`;
}
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Ordena filas por una columna (accessor). Numérico → resta; texto → localeCompare.
function sortRows(rows, sort, accessors) {
  if (!sort?.key || !accessors[sort.key]) return rows;
  const get = accessors[sort.key];
  const arr = [...rows];
  arr.sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    let cmp;
    if (typeof va === 'string' || typeof vb === 'string') {
      cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'es', { numeric: true, sensitivity: 'base' });
    } else {
      cmp = (va ?? 0) - (vb ?? 0);
    }
    return sort.dir === 'desc' ? -cmp : cmp;
  });
  return arr;
}

// Encabezado clicable que ordena la tabla. Columnas numéricas arrancan de mayor a menor.
function SortTh({ label, col, sort, setSort, numeric, className, style }) {
  const active = sort.key === col;
  function toggle() {
    if (active) setSort({ key: col, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else setSort({ key: col, dir: numeric ? 'desc' : 'asc' });
  }
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕';
  return (
    <th className={className} style={{ cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', ...style }}
      onClick={toggle} title="Ordenar">
      {label} <span style={{ opacity: active ? 1 : 0.35, fontSize: '0.75em' }}>{arrow}</span>
    </th>
  );
}

// Barra de filtros compartida (nivel / profesor / grupo, + estado opcional)
// para Ingresos y Pagos Estudiantes.
function FilterBar({ options, level, setLevel, prof, setProf, group, setGroup, status, setStatus, shown, total }) {
  const hasStatus = typeof setStatus === 'function';
  const active = level || prof || group || (hasStatus && status);
  return (
    <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
      <select className="form-input form-select" style={{ minHeight: 36, width: 'auto', fontSize: '0.85rem' }}
        value={level} onChange={(e) => setLevel(e.target.value)}>
        <option value="">Todos los niveles</option>
        {options.levels.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <select className="form-input form-select" style={{ minHeight: 36, width: 'auto', fontSize: '0.85rem' }}
        value={prof} onChange={(e) => setProf(e.target.value)}>
        <option value="">Todos los profes</option>
        {options.professors.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select className="form-input form-select" style={{ minHeight: 36, width: 'auto', fontSize: '0.85rem' }}
        value={group} onChange={(e) => setGroup(e.target.value)}>
        <option value="">Todos los grupos</option>
        {options.groups.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      {hasStatus && (
        <select className="form-input form-select" style={{ minHeight: 36, width: 'auto', fontSize: '0.85rem' }}
          value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {options.statuses.map((s) => (
            <option key={s} value={s}>{STUDENT_STATUS[s] ? `${STUDENT_STATUS[s].icon} ${STUDENT_STATUS[s].label}` : s}</option>
          ))}
        </select>
      )}
      {active && (
        <button className="btn btn-ghost" style={{ minHeight: 36, fontSize: '0.8rem' }}
          onClick={() => { setLevel(''); setProf(''); setGroup(''); if (hasStatus) setStatus(''); }}>
          ✕ Limpiar ({shown} de {total})
        </button>
      )}
    </div>
  );
}

function StatCard({ icon, tint, label, value, sub, subColor }) {
  return (
    <div className="card">
      <div className="kpi-ico" style={{ background: tint.bg, color: tint.fg }}>{icon}</div>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-num" style={{ fontSize: '1.5rem' }}>{value}</div>
      {sub && <div className="kpi-sub" style={{ color: subColor || 'var(--text-soft)' }}>{sub}</div>}
    </div>
  );
}

const TABS = [
  { key: 'income', label: '💵 Ingresos' },
  { key: 'expenses', label: '📤 Gastos' },
  { key: 'operating', label: '🧾 Fijos y variables' },
  { key: 'balance', label: '⚖️ Balance' },
  { key: 'students', label: '🎓 Pagos Estudiantes' },
];

// Formulario vacío del modal de gasto. `kind` decide qué fechas se piden:
// FIJO → vigencia (inicio/fin); VARIABLE → la fecha del gasto.
function emptyExpenseForm(kind = 'FIJO') {
  return {
    // Un gasto fijo casi siempre es arriendo o servicios; uno variable es
    // impredecible, así que arranca en "Otro".
    kind, category: kind === 'FIJO' ? 'ARRIENDO' : 'OTRO', concept: '', amount: '',
    provider: '', note: '', startDate: bogotaTodayStr(), endDate: '',
    expenseDate: bogotaTodayStr(),
  };
}

// Modal de creación/edición de un gasto operativo.
function ExpenseModal({ form, setForm, onSave, onClose, saving, editing }) {
  const isFixed = form.kind === 'FIJO';
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1">{editing ? 'Editar gasto' : 'Agregar gasto'}</h2>
        <p className="text-gray text-sm mb-3">
          {isFixed
            ? 'Un gasto fijo se cobra en cada quincena de su vigencia. El monto que escribas es el de UNA quincena.'
            : 'Un gasto variable se cobra una sola vez, en la quincena de su fecha.'}
        </p>

        {/* Tipo de gasto */}
        <label className="form-label">Tipo de gasto</label>
        <div className="flex gap-2 mb-3">
          {['FIJO', 'VARIABLE'].map((k) => (
            <button key={k} type="button"
              className={`btn ${form.kind === k ? 'btn-primary' : 'btn-outline'}`}
              style={{ flex: 1, minHeight: 42 }}
              onClick={() => setForm((f) => ({ ...f, kind: k }))}>
              {k === 'FIJO' ? '🔁 Fijo quincenal' : '⚡ Variable'}
            </button>
          ))}
        </div>

        <div className="form-group">
          <label className="form-label">Concepto *</label>
          <input className="form-input" value={form.concept} maxLength={200}
            placeholder={isFixed ? 'Ej: Arriendo cancha 3' : 'Ej: Compra de pelotas'}
            onChange={(e) => setForm((f) => ({ ...f, concept: e.target.value }))} />
        </div>

        <div className="form-group">
          <label className="form-label">Categoría</label>
          <select className="form-input form-select" value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {EXPENSE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{isFixed ? 'Monto por quincena (COP) *' : 'Monto (COP) *'}</label>
          <input className="form-input" type="number" min="1" step="1" inputMode="numeric"
            value={form.amount} placeholder="0"
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          {form.amount > 0 && (
            <div className="text-xs text-gray" style={{ marginTop: 4 }}>
              {fmt(Number(form.amount))}{isFixed ? ' cada quincena' : ''}
            </div>
          )}
        </div>

        {isFixed ? (
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
              <label className="form-label">Fecha de inicio *</label>
              <input className="form-input" type="date" value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
              <label className="form-label">Fecha de fin</label>
              <input className="form-input" type="date" value={form.endDate} min={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              <div className="text-xs text-gray" style={{ marginTop: 4 }}>
                Déjala vacía si sigue vigente sin fecha de fin.
              </div>
            </div>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">Fecha del gasto *</label>
            <input className="form-input" type="date" value={form.expenseDate}
              onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} />
            {form.expenseDate && (
              <div className="text-xs text-gray" style={{ marginTop: 4 }}>
                Se carga a la quincena {periodDatesLabel(periodOf(form.expenseDate))}.
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Proveedor / beneficiario</label>
          <input className="form-input" value={form.provider} maxLength={200}
            placeholder="Opcional"
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} />
        </div>

        <div className="form-group">
          <label className="form-label">Nota</label>
          <textarea className="form-input" rows={2} value={form.note} maxLength={1000}
            placeholder="Opcional"
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>

        <div className="flex gap-2" style={{ marginTop: 12 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onSave} disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar gasto'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountingPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('income');
  const [semester, setSemester] = useState(null);
  const [range, setRange] = useState(null); // { from, to }
  const [firstPaymentDate, setFirstPaymentDate] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filtros compartidos (nivel / profesor / grupo) para Ingresos y Pagos Estudiantes.
  const [levelFilter, setLevelFilter] = useState('');
  const [profFilter, setProfFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // solo Pagos Estudiantes
  // Orden de cada tabla (columna + dirección).
  const [incomeSort, setIncomeSort] = useState({ key: 'paymentDate', dir: 'desc' });
  const [studentSort, setStudentSort] = useState({ key: 'name', dir: 'asc' });

  // Gastos operativos: definiciones (fijos y variables) + estado del modal.
  const [expenseDefs, setExpenseDefs] = useState([]);
  const [expenseForm, setExpenseForm] = useState(null); // null = modal cerrado
  const [editingExpense, setEditingExpense] = useState(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseKindFilter, setExpenseKindFilter] = useState('');

  // Rango inicial: desde el PRIMER pago registrado hasta hoy (para ver toda la
  // historia de pagos). Si aún no hay pagos, cae al semestre activo o al mes actual.
  useEffect(() => {
    Promise.all([
      api.get('/semesters/active').catch(() => null),
      api.get('/accounting/first-payment').catch(() => null),
    ]).then(([s, meta]) => {
      setSemester(s || null);
      const first = meta?.firstPaymentDate || null;
      setFirstPaymentDate(first);
      if (first) setRange({ from: first, to: bogotaTodayStr() });
      else if (s?.startDate && s?.endDate) setRange({ from: dateStr(s.startDate), to: dateStr(s.endDate) });
      else setRange(monthRange());
    });
  }, []);

  useEffect(() => {
    if (!range) return;
    setLoading(true);
    api.get('/accounting/summary', range)
      .then(setData)
      .catch((err) => { console.error(err); setData(null); })
      .finally(() => setLoading(false));
  }, [range]);

  // Las definiciones de gastos no dependen del rango (la vigencia sí, pero eso
  // lo resuelve el servidor al expandirlas por quincena).
  function loadExpenseDefs() {
    return api.get('/accounting/expenses')
      .then(setExpenseDefs)
      .catch((err) => { console.error(err); setExpenseDefs([]); });
  }
  useEffect(() => { loadExpenseDefs(); }, []);

  // Recarga el resumen tras crear/editar/pagar un gasto (cambian los agregados).
  function reloadSummary() {
    if (!range) return Promise.resolve();
    return api.get('/accounting/summary', range).then(setData).catch((err) => console.error(err));
  }

  async function handleSaveExpense() {
    const f = expenseForm;
    if (!f.concept.trim()) return toast.error('Escribe el concepto del gasto');
    if (!(Number(f.amount) > 0)) return toast.error('El monto debe ser mayor que cero');
    if (f.kind === 'FIJO' && !f.startDate) return toast.error('Un gasto fijo necesita fecha de inicio');
    if (f.kind === 'VARIABLE' && !f.expenseDate) return toast.error('Un gasto variable necesita la fecha del gasto');

    const body = {
      kind: f.kind, category: f.category, concept: f.concept.trim(),
      amount: Number(f.amount),
      provider: f.provider.trim() || null,
      note: f.note.trim() || null,
      ...(f.kind === 'FIJO'
        ? { startDate: f.startDate, endDate: f.endDate || null }
        : { expenseDate: f.expenseDate }),
    };

    setSavingExpense(true);
    try {
      if (editingExpense) await api.put(`/accounting/expenses/${editingExpense.id}`, body);
      else await api.post('/accounting/expenses', body);
      setExpenseForm(null);
      setEditingExpense(null);
      await Promise.all([loadExpenseDefs(), reloadSummary()]);
      toast.success(editingExpense ? 'Gasto actualizado' : 'Gasto agregado');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingExpense(false);
    }
  }

  function openNewExpense(kind) {
    setEditingExpense(null);
    setExpenseForm(emptyExpenseForm(kind));
  }

  function openEditExpense(def) {
    setEditingExpense(def);
    setExpenseForm({
      kind: def.kind,
      category: def.category,
      concept: def.concept || '',
      amount: String(def.amount ?? ''),
      provider: def.provider || '',
      note: def.note || '',
      startDate: def.startDate || bogotaTodayStr(),
      endDate: def.endDate || '',
      expenseDate: def.expenseDate || bogotaTodayStr(),
    });
  }

  // Archivar (active = false): deja de causarse pero el histórico se conserva.
  async function handleArchiveExpense(def) {
    if (!window.confirm(`¿Archivar "${def.concept}"? Deja de cobrarse de aquí en adelante y el histórico se conserva.`)) return;
    try {
      await api.delete(`/accounting/expenses/${def.id}`);
      await Promise.all([loadExpenseDefs(), reloadSummary()]);
      toast.success('Gasto archivado');
    } catch (err) {
      toast.error(err.message);
    }
  }

  // Marca/desmarca pagada UNA quincena del gasto (un fijo se paga quincena a quincena).
  async function handleToggleExpensePaid(occurrence) {
    try {
      await api.patch(`/accounting/expenses/${occurrence.expenseId}/paid`, {
        period: occurrence.period,
        paid: !occurrence.paid,
      });
      await Promise.all([loadExpenseDefs(), reloadSummary()]);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleVerify(payment) {
    try {
      const r = await api.patch(`/accounting/payments/${payment.id}/verified`, { verified: !payment.verifiedAt });
      setData((prev) => {
        if (!prev) return prev;
        const payments = prev.income.payments.map((p) =>
          p.id === payment.id ? { ...p, verifiedAt: r.verifiedAt, verifiedByName: r.verifiedByName } : p
        );
        // Recalcular los totales de verificación en el cliente para no recargar todo.
        let verifiedTotal = 0, verifiedCount = 0, unverifiedTotal = 0, unverifiedCount = 0;
        for (const p of payments) {
          if (p.verifiedAt) { verifiedTotal += p.amount; verifiedCount += 1; }
          else { unverifiedTotal += p.amount; unverifiedCount += 1; }
        }
        return { ...prev, income: { ...prev.income, payments, verifiedTotal, verifiedCount, unverifiedTotal, unverifiedCount } };
      });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const token = localStorage.getItem('stmc_token');
      const res = await fetch(`/api/accounting/export?from=${range.from}&to=${range.to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contabilidad-${range.from}-a-${range.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  const income = data?.income;
  const expenses = data?.expenses;
  // Default en cero para que la pestaña Gastos no dependa de que la respuesta
  // traiga la clave (p. ej. un bundle viejo en caché contra un servidor nuevo).
  const operating = data?.operating || EMPTY_OPERATING;
  const balance = data?.balance;
  const studentsTuition = data?.studentsTuition;

  // Gasto total causado del rango = nómina de clases + gastos operativos.
  const totalAccrued = (expenses?.totals.accruedTotal || 0) + (operating?.totals.total || 0);

  // Ocurrencias filtradas por tipo, agrupadas por quincena para el detalle.
  const operatingView = useMemo(() => {
    const occ = (operating?.occurrences || []).filter((o) => !expenseKindFilter || o.kind === expenseKindFilter);
    const groups = [];
    const index = {};
    for (const o of occ) {
      if (!index[o.period]) {
        index[o.period] = { period: o.period, items: [], total: 0, paidTotal: 0 };
        groups.push(index[o.period]);
      }
      index[o.period].items.push(o);
      index[o.period].total += o.amount;
      if (o.paid) index[o.period].paidTotal += o.amount;
    }
    return { groups, count: occ.length };
  }, [operating, expenseKindFilter]);

  // Cuántas quincenas del rango causa cada definición (para la columna "Quincenas").
  const occurrencesByDef = useMemo(() => {
    const map = {};
    for (const o of operating?.occurrences || []) {
      if (!map[o.expenseId]) map[o.expenseId] = { count: 0, total: 0, paid: 0 };
      map[o.expenseId].count += 1;
      map[o.expenseId].total += o.amount;
      if (o.paid) map[o.expenseId].paid += o.amount;
    }
    return map;
  }, [operating]);

  const visibleDefs = expenseDefs.filter((d) => !expenseKindFilter || d.kind === expenseKindFilter);
  const fixedDefsCount = expenseDefs.filter((d) => d.kind === 'FIJO').length;

  // Opciones de filtro: unión de niveles/profes/grupos de pagos y del roster.
  const filterOptions = useMemo(() => {
    const levels = new Set();
    const professors = new Set();
    const groups = new Set();
    const statuses = new Set();
    for (const r of studentsTuition?.rows || []) {
      if (r.level) levels.add(r.level);
      if (r.professor) professors.add(r.professor);
      if (r.groupCode) groups.add(r.groupCode);
      if (r.studentStatus) statuses.add(r.studentStatus);
    }
    for (const p of income?.payments || []) {
      if (p.level) levels.add(p.level);
      if (p.professor) professors.add(p.professor);
      if (p.groupCode) groups.add(p.groupCode);
    }
    const arr = (s) => [...s].sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' }));
    // Estados en el orden canónico del sistema (no alfabético).
    const statusOrder = Object.keys(STUDENT_STATUS);
    return {
      levels: arr(levels), professors: arr(professors), groups: arr(groups),
      statuses: statusOrder.filter((s) => statuses.has(s)),
    };
  }, [studentsTuition, income]);

  const matchesFilter = (o) => {
    if (levelFilter && o.level !== levelFilter) return false;
    if (profFilter && o.professor !== profFilter) return false;
    if (groupFilter && o.groupCode !== groupFilter) return false;
    return true;
  };
  const hasFilter = !!(levelFilter || profFilter || groupFilter);
  const studentsHasFilter = hasFilter || !!statusFilter;

  // Ingresos filtrados + ordenados, con KPIs recalculados sobre lo visible.
  const incomeView = useMemo(() => {
    const payments = (income?.payments || []).filter(matchesFilter);
    const totals = { total: 0, verifiedTotal: 0, verifiedCount: 0, unverifiedTotal: 0, unverifiedCount: 0, count: payments.length };
    const byMethod = {};
    for (const p of payments) {
      totals.total += p.amount;
      if (p.verifiedAt) { totals.verifiedTotal += p.amount; totals.verifiedCount += 1; }
      else { totals.unverifiedTotal += p.amount; totals.unverifiedCount += 1; }
      if (!byMethod[p.method]) byMethod[p.method] = { total: 0, count: 0, verifiedTotal: 0 };
      byMethod[p.method].total += p.amount;
      byMethod[p.method].count += 1;
      if (p.verifiedAt) byMethod[p.method].verifiedTotal += p.amount;
    }
    const rows = sortRows(payments, incomeSort, {
      paymentDate: (p) => new Date(p.paymentDate).getTime(),
      student: (p) => p.student?.name || '',
      method: (p) => p.method || '',
      amount: (p) => p.amount || 0,
    });
    return { rows, totals, byMethod };
  }, [income, levelFilter, profFilter, groupFilter, incomeSort]);

  // Pagos Estudiantes filtrados + ordenados, con totales recalculados.
  const studentsView = useMemo(() => {
    const src = (studentsTuition?.rows || []).filter(
      (r) => matchesFilter(r) && (!statusFilter || r.studentStatus === statusFilter)
    );
    const rows = sortRows(src, studentSort, {
      name: (r) => r.name || '',
      groupCode: (r) => r.groupCode || '',
      classesAcquired: (r) => r.classesAcquired || 0,
      expectedTotal: (r) => r.expectedTotal || 0,
      totalPaid: (r) => r.totalPaid || 0,
      balance: (r) => r.balance || 0,
    });
    const totals = src.reduce(
      (acc, r) => ({
        students: acc.students + 1,
        expected: acc.expected + (r.expectedTotal || 0),
        paid: acc.paid + (r.totalPaid || 0),
        debt: acc.debt + (r.balance > 0 ? r.balance : 0),
        matriculados: acc.matriculados + (r.studentStatus === 'MATRICULADO' ? 1 : 0),
        withDebt: acc.withDebt + (r.balance > 0 ? 1 : 0),
        missingBirthDate: acc.missingBirthDate + (r.missingBirthDate ? 1 : 0),
      }),
      { students: 0, expected: 0, paid: 0, debt: 0, matriculados: 0, withDebt: 0, missingBirthDate: 0 }
    );
    return { rows, totals };
  }, [studentsTuition, levelFilter, profFilter, groupFilter, statusFilter, studentSort]);

  return (
    <div className="page page-wide">
      <div className="page-content" style={{ paddingTop: 8 }}>
        {/* Encabezado */}
        <div className="flex items-center justify-between mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
            <div>
              <h1 style={{ fontSize: '1.9rem' }}>Contabilidad</h1>
              <p className="text-gray text-sm">Ingresos, gastos y balance de la academia</p>
            </div>
          </div>
          <button className="btn btn-outline" style={{ minHeight: 40 }} onClick={handleExport}
            disabled={exporting || !range}>
            {exporting ? 'Exportando…' : '⬇ Excel (5 hojas)'}
          </button>
        </div>

        {/* Filtro de rango */}
        {range && (
          <div className="card mb-3">
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              {firstPaymentDate && (
                <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem' }}
                  onClick={() => setRange({ from: firstPaymentDate, to: bogotaTodayStr() })}
                  title={`Desde el primer pago (${firstPaymentDate})`}>Desde el primer pago</button>
              )}
              <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem' }}
                onClick={() => setRange(monthRange())}>Este mes</button>
              <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem' }}
                onClick={() => setRange(monthRange(-1))}>Mes anterior</button>
              {semester && (
                <button className="btn btn-ghost" style={{ minHeight: 34, fontSize: '0.8rem' }}
                  onClick={() => setRange({ from: dateStr(semester.startDate), to: dateStr(semester.endDate) })}>
                  Semestre ({semester.name})
                </button>
              )}
              <div className="flex items-center gap-2" style={{ marginLeft: 'auto', flexWrap: 'wrap' }}>
                <input type="date" className="form-input" style={{ width: 'auto', minHeight: 34, fontSize: '0.85rem' }}
                  value={range.from} max={range.to}
                  onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
                <span className="text-gray text-sm">a</span>
                <input type="date" className="form-input" style={{ width: 'auto', minHeight: 34, fontSize: '0.85rem' }}
                  value={range.to} min={range.from}
                  onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {/* Pestañas */}
        <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.key} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}
              style={{ minHeight: 38 }} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {loading || !range ? <div className="spinner" /> : !data ? (
          <div className="alert alert-info">No se pudo cargar la información contable.</div>
        ) : (
          <>
            {/* ===== Hoja 1: Ingresos ===== */}
            {tab === 'income' && (
              <>
                <div className="home-kpis">
                  <StatCard icon="💵" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
                    label="Total de ingresos" value={fmt(incomeView.totals.total)}
                    sub={`${incomeView.totals.count} pago${incomeView.totals.count !== 1 ? 's' : ''}${hasFilter ? ' (filtrado)' : ' registrados'}`} />
                  <StatCard icon="✓" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
                    label="Verificado" value={fmt(incomeView.totals.verifiedTotal)}
                    sub={`${incomeView.totals.verifiedCount} pago${incomeView.totals.verifiedCount !== 1 ? 's' : ''} conciliados`} subColor="var(--success)" />
                  <StatCard icon="⏳" tint={{ bg: 'rgba(232,162,59,0.14)', fg: '#E8A23B' }}
                    label="Sin verificar" value={fmt(incomeView.totals.unverifiedTotal)}
                    sub={incomeView.totals.unverifiedCount > 0 ? `${incomeView.totals.unverifiedCount} por conciliar` : 'todo conciliado'}
                    subColor={incomeView.totals.unverifiedCount > 0 ? 'var(--warning)' : 'var(--success)'} />
                  <StatCard icon="🏦" tint={{ bg: 'rgba(79,159,178,0.14)', fg: '#4F9FB2' }}
                    label="Efectivo recibido" value={fmt(incomeView.byMethod?.EFECTIVO?.total || 0)}
                    sub="para arqueo de caja" />
                </div>

                <FilterBar options={filterOptions}
                  level={levelFilter} setLevel={setLevelFilter}
                  prof={profFilter} setProf={setProfFilter}
                  group={groupFilter} setGroup={setGroupFilter}
                  shown={incomeView.totals.count} total={income.payments.length} />

                {/* Desglose por medio de pago (conciliación bancaria) */}
                {Object.keys(incomeView.byMethod || {}).length > 0 && (
                  <div className="card mb-3">
                    <h3 className="mb-2">Por medio de pago</h3>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr><th>Medio</th><th className="num">Pagos</th><th className="num">Total</th><th className="num">Verificado</th></tr>
                        </thead>
                        <tbody>
                          {Object.entries(incomeView.byMethod).map(([method, m]) => (
                            <tr key={method}>
                              <td><span className={`badge ${METHOD_BADGE[method] || 'badge-gray'}`}>{METHOD_LABEL[method] || method}</span></td>
                              <td className="num">{m.count}</td>
                              <td className="num font-medium">{fmt(m.total)}</td>
                              <td className="num" style={{ color: m.verifiedTotal < m.total ? 'var(--warning)' : 'var(--success)' }}>
                                {fmt(m.verifiedTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Detalle de pagos con verificación */}
                {income.payments.length === 0 ? (
                  <div className="alert alert-info">No hay pagos registrados en este rango.</div>
                ) : incomeView.rows.length === 0 ? (
                  <div className="alert alert-info">Ningún pago coincide con los filtros.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <SortTh label="Fecha" col="paymentDate" sort={incomeSort} setSort={setIncomeSort} />
                          <SortTh label="Estudiante" col="student" sort={incomeSort} setSort={setIncomeSort} />
                          <th>Grupo</th>
                          <SortTh label="Medio" col="method" sort={incomeSort} setSort={setIncomeSort} />
                          <th>Recibido por</th>
                          <SortTh label="Monto" col="amount" sort={incomeSort} setSort={setIncomeSort} numeric className="num" />
                          <th style={{ textAlign: 'center' }}>Verificado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incomeView.rows.map((p) => (
                          <tr key={p.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.paymentDate, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                            <td>
                              {p.student?.id ? (
                                <button className="link-name font-medium"
                                  onClick={() => navigate('/admin/students', { state: { focusStudentId: p.student.id, from: { label: 'Contabilidad', to: '/admin/accounting' } } })}
                                  title="Ver ficha del estudiante">
                                  {p.student.name} ›
                                </button>
                              ) : (
                                <div className="font-medium">{p.student?.name}</div>
                              )}
                              {p.note && <div className="text-xs text-gray">{p.note}</div>}
                            </td>
                            <td className="text-sm">
                              {p.groupCode || '—'}
                              {p.level && <div className="text-xs text-gray">{p.level}</div>}
                            </td>
                            <td><span className={`badge ${METHOD_BADGE[p.method] || 'badge-gray'}`}>{METHOD_LABEL[p.method] || p.method}</span></td>
                            <td className="text-sm text-gray">{p.receivedByName || '—'}</td>
                            <td className="num font-medium">{fmt(p.amount)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <label className="flex items-center gap-2" style={{ justifyContent: 'center', cursor: 'pointer' }}
                                title={p.verifiedAt ? `Verificado por ${p.verifiedByName || '—'}` : 'Marcar como verificado'}>
                                <input type="checkbox" checked={!!p.verifiedAt} onChange={() => handleVerify(p)}
                                  style={{ width: 20, height: 20, accentColor: 'var(--green, #1FA971)' }} />
                                {p.verifiedAt && <span className="badge badge-green">✓</span>}
                              </label>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={5}>{hasFilter ? 'Total filtrado' : 'Total del rango'}</td>
                          <td className="num" style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmt(incomeView.totals.total)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ===== Hoja 2: Gastos ===== */}
            {tab === 'expenses' && (
              <>
                <div className="home-kpis">
                  <StatCard icon="📤" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
                    label="Gasto causado total" value={fmt(totalAccrued)}
                    sub={`${fmt(expenses.totals.accruedTotal)} nómina + ${fmt(operating.totals.total)} operativos`} />
                  <StatCard icon="🎾" tint={{ bg: 'rgba(122,90,248,0.14)', fg: '#7A5AF8' }}
                    label="Nómina de clases" value={fmt(expenses.totals.accruedTotal)}
                    sub={`${expenses.totals.classCount} clases liquidadas`} />
                  <StatCard icon="💸" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
                    label="Pagado" value={fmt(expenses.totals.paidTotal + operating.totals.paidTotal)}
                    sub={`nómina ${fmt(expenses.totals.paidTotal)} · operativos ${fmt(operating.totals.paidTotal)}`}
                    subColor="var(--success)" />
                  <StatCard icon="⏸" tint={{ bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                    label="Retenido" value={fmt(expenses.totals.retainedTotal)}
                    sub="suspendido / pendiente de validación"
                    subColor={expenses.totals.retainedTotal > 0 ? 'var(--red)' : 'var(--text-soft)'} />
                </div>

                <h3 className="mb-2">Nómina de clases por quincena</h3>
                {expenses.rows.length === 0 ? (
                  <div className="alert alert-info">No hay liquidaciones en este rango.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Quincena</th><th className="num">Clases</th><th className="num">Profesores</th>
                          <th className="num">Asistentes</th><th className="num">Causado</th><th className="num">Pagado</th>
                          <th className="num">Retenido</th><th>Estado</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.rows.map((r) => (
                          <tr key={r.period}>
                            <td style={{ whiteSpace: 'nowrap' }} className="font-medium">{periodLabel(r.period, semester)}</td>
                            <td className="num">{r.classCount}</td>
                            <td className="num">{fmt(r.professorsAccrued)}</td>
                            <td className="num">{fmt(r.assistantsAccrued)}</td>
                            <td className="num font-medium" style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmt(r.accruedTotal)}</td>
                            <td className="num" style={{ color: r.paidTotal >= r.accruedTotal && r.accruedTotal > 0 ? 'var(--success)' : 'inherit' }}>
                              {fmt(r.paidTotal)}
                            </td>
                            <td className="num" style={{ color: r.retainedTotal > 0 ? 'var(--red)' : 'var(--gray-400)' }}>
                              {r.retainedTotal > 0 ? fmt(r.retainedTotal) : '—'}
                            </td>
                            <td>
                              {r.locked
                                ? <span className="badge badge-gray" title={`Cerrada por ${r.closedByName || '—'}`}>🔒 Cerrada</span>
                                : <span className="badge badge-blue">Abierta</span>}
                            </td>
                            <td>
                              <button className="btn btn-ghost" style={{ minHeight: 28, fontSize: '0.75rem', padding: '0 8px' }}
                                onClick={() => navigate('/admin/payroll')}>Ver</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Total</td>
                          <td className="num">{expenses.totals.classCount}</td>
                          <td className="num">{fmt(expenses.totals.professorsAccrued)}</td>
                          <td className="num">{fmt(expenses.totals.assistantsAccrued)}</td>
                          <td className="num" style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmt(expenses.totals.accruedTotal)}</td>
                          <td className="num">{fmt(expenses.totals.paidTotal)}</td>
                          <td className="num" style={{ color: expenses.totals.retainedTotal > 0 ? 'var(--red)' : 'inherit' }}>
                            {expenses.totals.retainedTotal > 0 ? fmt(expenses.totals.retainedTotal) : '—'}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Gastos operativos por quincena: el resumen vive aquí para que
                    el gasto total del rango cuadre en una sola pantalla; el
                    registro y el detalle están en la pestaña Fijos y variables. */}
                <div className="flex items-center justify-between mb-2" style={{ marginTop: 20, gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>Gastos fijos y variables por quincena</h3>
                  <button className="btn btn-ghost" style={{ minHeight: 32, fontSize: '0.8rem' }}
                    onClick={() => setTab('operating')}>Registrar / ver detalle ›</button>
                </div>
                {operating.totals.count === 0 ? (
                  <div className="alert alert-info">
                    Aún no hay gastos fijos ni variables en este rango.{' '}
                    <button className="link-name" onClick={() => setTab('operating')}>Agregar el primero</button>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Quincena</th><th className="num">Gastos</th><th className="num">Fijos</th>
                          <th className="num">Variables</th><th className="num">Total</th>
                          <th className="num">Pagado</th><th className="num">Pendiente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operating.rows.map((r) => (
                          <tr key={r.period}>
                            <td style={{ whiteSpace: 'nowrap' }} className="font-medium">{periodLabel(r.period, semester)}</td>
                            <td className="num">{r.count}</td>
                            <td className="num">{r.fixedTotal > 0 ? fmt(r.fixedTotal) : '—'}</td>
                            <td className="num">{r.variableTotal > 0 ? fmt(r.variableTotal) : '—'}</td>
                            <td className="num font-medium" style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmt(r.total)}</td>
                            <td className="num" style={{ color: r.paidTotal > 0 ? 'var(--success)' : 'inherit' }}>{fmt(r.paidTotal)}</td>
                            <td className="num" style={{ color: r.unpaidTotal > 0 ? 'var(--warning)' : 'var(--gray-400)' }}>
                              {r.unpaidTotal > 0 ? fmt(r.unpaidTotal) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Total</td>
                          <td className="num">{operating.totals.count}</td>
                          <td className="num">{fmt(operating.totals.fixedTotal)}</td>
                          <td className="num">{fmt(operating.totals.variableTotal)}</td>
                          <td className="num" style={{ color: 'var(--brand-indigo, var(--blue))' }}>{fmt(operating.totals.total)}</td>
                          <td className="num">{fmt(operating.totals.paidTotal)}</td>
                          <td className="num">{fmt(operating.totals.unpaidTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                <div className="card" style={{ marginTop: 16 }}>
                  <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div className="kpi-lbl">Gasto causado del rango</div>
                      <div className="text-xs text-gray">Nómina de clases + gastos fijos y variables. Los retenidos no suman.</div>
                    </div>
                    <div className="kpi-num" style={{ fontSize: '1.6rem', color: 'var(--red)' }}>{fmt(totalAccrued)}</div>
                  </div>
                </div>
              </>
            )}

            {/* ===== Hoja 3: Gastos fijos y variables (operativos) ===== */}
            {tab === 'operating' && (
              <>
                <div className="home-kpis">
                  <StatCard icon="🧾" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
                    label="Causado en el rango" value={fmt(operating.totals.total)}
                    sub={`${operating.totals.count} cobro${operating.totals.count !== 1 ? 's' : ''} de quincena`} />
                  <StatCard icon="🔁" tint={{ bg: 'rgba(122,90,248,0.14)', fg: '#7A5AF8' }}
                    label="Gastos fijos" value={fmt(operating.totals.fixedTotal)}
                    sub={fixedDefsCount === 1 ? '1 gasto fijo registrado' : `${fixedDefsCount} gastos fijos registrados`} />
                  <StatCard icon="⚡" tint={{ bg: 'rgba(232,162,59,0.14)', fg: '#E8A23B' }}
                    label="Gastos variables" value={fmt(operating.totals.variableTotal)}
                    sub="cobros de una sola vez" />
                  <StatCard icon="🕐" tint={{ bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                    label="Pendiente de pago" value={fmt(operating.totals.unpaidTotal)}
                    sub={`pagado: ${fmt(operating.totals.paidTotal)}`}
                    subColor={operating.totals.unpaidTotal > 0 ? 'var(--warning)' : 'var(--success)'} />
                </div>

                <div className="alert alert-info mb-3" style={{ fontSize: '0.85rem' }}>
                  <strong>Fijo</strong> = se cobra en <em>cada</em> quincena entre su fecha de inicio y su fecha de fin
                  (el monto que registras es el de una quincena; sin fecha de fin sigue vigente).{' '}
                  <strong>Variable</strong> = se cobra una sola vez, en la quincena de su fecha. El pago se marca
                  quincena por quincena, así que un gasto fijo puede estar pagado en una quincena y pendiente en la siguiente.
                </div>

                {/* Acciones + filtro por tipo */}
                <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" style={{ minHeight: 40 }} onClick={() => openNewExpense('FIJO')}>
                    + Gasto fijo quincenal
                  </button>
                  <button className="btn btn-outline" style={{ minHeight: 40 }} onClick={() => openNewExpense('VARIABLE')}>
                    + Gasto variable
                  </button>
                  <select className="form-input form-select" style={{ minHeight: 38, width: 'auto', fontSize: '0.85rem', marginLeft: 'auto' }}
                    value={expenseKindFilter} onChange={(e) => setExpenseKindFilter(e.target.value)}>
                    <option value="">Fijos y variables</option>
                    <option value="FIJO">Solo fijos</option>
                    <option value="VARIABLE">Solo variables</option>
                  </select>
                </div>

                {/* Gastos registrados (definiciones) */}
                <h3 className="mb-2">Gastos registrados</h3>
                {visibleDefs.length === 0 ? (
                  <div className="alert alert-info mb-3">
                    {expenseDefs.length === 0
                      ? 'Todavía no has registrado gastos fijos ni variables. Empieza con el arriendo de canchas o los servicios.'
                      : 'Ningún gasto coincide con el filtro.'}
                  </div>
                ) : (
                  <div className="table-wrap mb-4">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tipo</th><th>Concepto</th><th>Categoría</th>
                          <th>Vigencia / Fecha</th><th className="num">Monto</th>
                          <th className="num">En el rango</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleDefs.map((d) => {
                          const inRange = occurrencesByDef[d.id];
                          return (
                            <tr key={d.id}>
                              <td><span className={`badge ${KIND_BADGE[d.kind] || 'badge-gray'}`}>{KIND_LABEL[d.kind] || d.kind}</span></td>
                              <td>
                                <div className="font-medium">{d.concept}</div>
                                {d.provider && <div className="text-xs text-gray">{d.provider}</div>}
                                {d.note && <div className="text-xs text-gray">{d.note}</div>}
                              </td>
                              <td className="text-sm">{CATEGORY_LABEL[d.category] || d.category}</td>
                              <td className="text-sm" style={{ whiteSpace: 'nowrap' }}>
                                {d.kind === 'FIJO' ? (
                                  <>
                                    {fmtDate(d.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {' → '}
                                    {d.endDate
                                      ? fmtDate(d.endDate, { day: 'numeric', month: 'short', year: 'numeric' })
                                      : <span className="badge badge-green">sin fin</span>}
                                  </>
                                ) : fmtDate(d.expenseDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="num font-medium">
                                {fmt(d.amount)}
                                {d.kind === 'FIJO' && <div className="text-xs text-gray">por quincena</div>}
                              </td>
                              <td className="num">
                                {inRange ? (
                                  <>
                                    <div className="font-medium">{fmt(inRange.total)}</div>
                                    <div className="text-xs text-gray">
                                      {inRange.count} quincena{inRange.count !== 1 ? 's' : ''}
                                    </div>
                                  </>
                                ) : <span className="text-gray">—</span>}
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <button className="btn btn-ghost" style={{ minHeight: 28, fontSize: '0.75rem', padding: '0 8px' }}
                                  onClick={() => openEditExpense(d)}>✏️</button>
                                <button className="btn btn-ghost" style={{ minHeight: 28, fontSize: '0.75rem', padding: '0 8px', color: 'var(--red)' }}
                                  onClick={() => handleArchiveExpense(d)} title="Archivar">🗄️</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Detalle por quincena, con la marca de pago por cobro */}
                <h3 className="mb-2">Cobros por quincena</h3>
                {operatingView.count === 0 ? (
                  <div className="alert alert-info">
                    Ningún gasto se causa en el rango seleccionado
                    {expenseDefs.length > 0 ? ' (revisa las fechas de vigencia o amplía el rango arriba).' : '.'}
                  </div>
                ) : operatingView.groups.map((g) => (
                  <div className="card mb-3" key={g.period}>
                    <div className="flex items-center justify-between mb-2" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0 }}>{periodLabel(g.period, semester)}</h4>
                      <div className="text-sm">
                        <span className="font-medium">{fmt(g.total)}</span>
                        {g.paidTotal > 0 && <span style={{ color: 'var(--success)' }}> · pagado {fmt(g.paidTotal)}</span>}
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Tipo</th><th>Concepto</th><th>Categoría</th>
                            <th className="num">Monto</th><th style={{ textAlign: 'center' }}>Pagado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((o) => (
                            <tr key={`${o.expenseId}-${o.period}`}>
                              <td><span className={`badge ${KIND_BADGE[o.kind] || 'badge-gray'}`}>{KIND_LABEL[o.kind] || o.kind}</span></td>
                              <td>
                                <div className="font-medium">{o.concept}</div>
                                {o.provider && <div className="text-xs text-gray">{o.provider}</div>}
                              </td>
                              <td className="text-sm">{CATEGORY_LABEL[o.category] || o.category}</td>
                              <td className="num font-medium">{fmt(o.amount)}</td>
                              <td style={{ textAlign: 'center' }}>
                                <label className="flex items-center gap-2" style={{ justifyContent: 'center', cursor: 'pointer' }}
                                  title={o.paid ? `Pagado por ${o.paidByName || '—'}` : 'Marcar como pagado'}>
                                  <input type="checkbox" checked={o.paid} onChange={() => handleToggleExpensePaid(o)}
                                    style={{ width: 20, height: 20, accentColor: 'var(--green, #1FA971)' }} />
                                  {o.paid && <span className="badge badge-green">✓</span>}
                                </label>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {/* Desglose por categoría */}
                {Object.keys(operating.byCategory || {}).length > 0 && (
                  <div className="card">
                    <h3 className="mb-2">Por categoría</h3>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr><th>Categoría</th><th className="num">Cobros</th><th className="num">Total</th><th className="num">Pagado</th></tr>
                        </thead>
                        <tbody>
                          {Object.entries(operating.byCategory)
                            .sort((a, b) => b[1].total - a[1].total)
                            .map(([cat, c]) => (
                              <tr key={cat}>
                                <td>{CATEGORY_LABEL[cat] || cat}</td>
                                <td className="num">{c.count}</td>
                                <td className="num font-medium">{fmt(c.total)}</td>
                                <td className="num" style={{ color: c.paidTotal < c.total ? 'var(--warning)' : 'var(--success)' }}>
                                  {fmt(c.paidTotal)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ===== Hoja 4: Balance ===== */}
            {tab === 'balance' && (
              <>
                <div className="home-kpis">
                  <StatCard icon="💵" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
                    label="Ingresos" value={fmt(balance.totals.income)}
                    sub={`verificado: ${fmt(income.verifiedTotal)}`} />
                  <StatCard icon="📤" tint={{ bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                    label="Gastos causados" value={fmt(balance.totals.expensesAccrued)}
                    sub={`nómina ${fmt(balance.totals.payrollAccrued)} · operativos ${fmt(balance.totals.operatingAccrued)}`} />
                  <StatCard icon={balance.totals.net >= 0 ? '📈' : '📉'}
                    tint={balance.totals.net >= 0
                      ? { bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }
                      : { bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                    label="Resultado neto" value={fmt(balance.totals.net)}
                    sub={balance.totals.net >= 0 ? 'superávit' : 'déficit'}
                    subColor={balance.totals.net >= 0 ? 'var(--success)' : 'var(--red)'} />
                  <StatCard icon="％" tint={{ bg: 'rgba(122,90,248,0.14)', fg: '#7A5AF8' }}
                    label="Margen" value={balance.totals.marginPct != null ? `${balance.totals.marginPct.toFixed(1)}%` : '—'}
                    sub="resultado / ingresos" />
                </div>

                <div className="alert alert-info mb-3" style={{ fontSize: '0.85rem' }}>
                  <strong>Criterio contable:</strong> los gastos se miden por <em>causación</em> (todo pago habilitado
                  a profesores/asistentes, más los gastos fijos y variables de la quincena, es un compromiso, se haya
                  pagado o no). Los pagos retenidos ({fmt(expenses.totals.retainedTotal)}) no entran al balance hasta
                  que se habiliten. Los ingresos sin verificar ({fmt(income.unverifiedTotal)}) sí suman: verifícalos
                  en la pestaña Ingresos para confiar en la cifra.
                </div>

                {balance.rows.length === 0 ? (
                  <div className="alert alert-info">Sin movimientos en este rango.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mes</th><th className="num">Ingresos</th>
                          <th className="num">Nómina de clases</th><th className="num">Fijos y variables</th>
                          <th className="num">Gastos causados</th>
                          <th className="num">Gastos pagados</th><th className="num">Resultado</th><th className="num">Acumulado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balance.rows.map((r) => (
                          <tr key={r.month}>
                            <td className="font-medium" style={{ textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{monthLabel(r.month)}</td>
                            <td className="num" style={{ color: 'var(--success)' }}>{fmt(r.income)}</td>
                            <td className="num text-gray">{fmt(r.payrollAccrued)}</td>
                            <td className="num text-gray">{fmt(r.operatingAccrued)}</td>
                            <td className="num" style={{ color: 'var(--red)' }}>{fmt(r.expensesAccrued)}</td>
                            <td className="num text-gray">{fmt(r.expensesPaid)}</td>
                            <td className="num font-medium" style={{ color: r.net >= 0 ? 'var(--success)' : 'var(--red)' }}>{fmt(r.net)}</td>
                            <td className="num" style={{ color: r.cumulativeNet >= 0 ? 'var(--brand-indigo, var(--blue))' : 'var(--red)' }}>
                              {fmt(r.cumulativeNet)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Total</td>
                          <td className="num">{fmt(balance.totals.income)}</td>
                          <td className="num">{fmt(balance.totals.payrollAccrued)}</td>
                          <td className="num">{fmt(balance.totals.operatingAccrued)}</td>
                          <td className="num">{fmt(balance.totals.expensesAccrued)}</td>
                          <td className="num">{fmt(balance.totals.expensesPaid)}</td>
                          <td className="num" style={{ color: balance.totals.net >= 0 ? 'var(--success)' : 'var(--red)' }}>
                            {fmt(balance.totals.net)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}
            {/* ===== Hoja 5: Pagos Estudiantes (ingresos y deudas) ===== */}
            {tab === 'students' && studentsTuition && (
              <>
                <div className="home-kpis">
                  <StatCard icon="🎓" tint={{ bg: 'rgba(63,82,168,0.12)', fg: '#3F52A8' }}
                    label="Valor esperado" value={fmt(studentsView.totals.expected)}
                    sub={`${studentsView.totals.students} estudiante${studentsView.totals.students !== 1 ? 's' : ''}${studentsHasFilter ? ' (filtrado)' : ' activos'}`} />
                  <StatCard icon="💵" tint={{ bg: 'rgba(31,169,113,0.14)', fg: '#1FA971' }}
                    label="Recaudado" value={fmt(studentsView.totals.paid)}
                    sub={`${studentsView.totals.matriculados} matriculados (pago completo)`} subColor="var(--success)" />
                  <StatCard icon="⏳" tint={{ bg: 'rgba(232,82,106,0.12)', fg: '#E8526A' }}
                    label="Deuda pendiente" value={fmt(studentsView.totals.debt)}
                    sub={`${studentsView.totals.withDebt} estudiante${studentsView.totals.withDebt !== 1 ? 's' : ''} con saldo`}
                    subColor={studentsView.totals.debt > 0 ? 'var(--red)' : 'var(--success)'} />
                  <StatCard icon="⚠️" tint={{ bg: 'rgba(232,162,59,0.14)', fg: '#E8A23B' }}
                    label="Sin fecha de nacimiento" value={studentsView.totals.missingBirthDate}
                    sub={studentsView.totals.missingBirthDate > 0 ? 'no se puede calcular su tarifa' : 'todos categorizados'}
                    subColor={studentsView.totals.missingBirthDate > 0 ? 'var(--red)' : 'var(--success)'} />
                </div>

                <div className="alert alert-info mb-3" style={{ fontSize: '0.85rem' }}>
                  Deuda = valor esperado del plan (clases adquiridas × tarifa adulto/pequeño según fecha de
                  nacimiento) − pagos registrados. No depende del rango de fechas: compara el plan completo.
                </div>

                <FilterBar options={filterOptions}
                  level={levelFilter} setLevel={setLevelFilter}
                  prof={profFilter} setProf={setProfFilter}
                  group={groupFilter} setGroup={setGroupFilter}
                  status={statusFilter} setStatus={setStatusFilter}
                  shown={studentsView.totals.students} total={studentsTuition.rows.length} />

                {studentsTuition.rows.length === 0 ? (
                  <div className="alert alert-info">No hay estudiantes activos.</div>
                ) : studentsView.rows.length === 0 ? (
                  <div className="alert alert-info">Ningún estudiante coincide con los filtros.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <SortTh label="Estudiante" col="name" sort={studentSort} setSort={setStudentSort} />
                          <SortTh label="Grupo" col="groupCode" sort={studentSort} setSort={setStudentSort} />
                          <th>Profesor</th><th>Estado</th><th>Categoría</th>
                          <SortTh label="Clases" col="classesAcquired" sort={studentSort} setSort={setStudentSort} numeric className="num" />
                          <SortTh label="Esperado" col="expectedTotal" sort={studentSort} setSort={setStudentSort} numeric className="num" />
                          <SortTh label="Pagado" col="totalPaid" sort={studentSort} setSort={setStudentSort} numeric className="num" />
                          <SortTh label="Saldo" col="balance" sort={studentSort} setSort={setStudentSort} numeric className="num" />
                        </tr>
                      </thead>
                      <tbody>
                        {studentsView.rows.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <button className="link-name font-medium"
                                onClick={() => navigate('/admin/students', { state: { focusStudentId: r.id, from: { label: 'Contabilidad', to: '/admin/accounting' } } })}
                                title="Ver ficha del estudiante">
                                <StudentStatusIcon status={r.studentStatus} missingBirthDate={r.missingBirthDate} />{r.name} ›
                              </button>
                            </td>
                            <td className="text-sm">
                              {r.groupCode || '—'}
                              {r.level && <div className="text-xs text-gray">{r.level}</div>}
                            </td>
                            <td className="text-sm text-gray">{r.professor || '—'}</td>
                            <td><StudentStatusBadge status={r.studentStatus} /></td>
                            <td className="text-sm">
                              {r.category === 'ADULTO' ? 'Adulto' : r.category === 'PEQUENO' ? 'Pequeño'
                                : <span className="badge badge-red">⚠️ Sin fecha</span>}
                            </td>
                            <td className="num">{r.classesAcquired}</td>
                            <td className="num">{r.expectedTotal != null ? fmt(r.expectedTotal) : '—'}</td>
                            <td className="num" style={{ color: 'var(--success)' }}>{fmt(r.totalPaid)}</td>
                            <td className="num font-medium" style={{ color: r.balance > 0 ? 'var(--red)' : r.balance === 0 ? 'var(--success)' : 'inherit' }}>
                              {r.balance != null ? (r.balance > 0 ? fmt(r.balance) : '✓ Al día') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={6}>{studentsHasFilter ? 'Total filtrado' : 'Total'} · {studentsView.totals.students} estudiante{studentsView.totals.students !== 1 ? 's' : ''}</td>
                          <td className="num">{fmt(studentsView.totals.expected)}</td>
                          <td className="num" style={{ color: 'var(--success)' }}>{fmt(studentsView.totals.paid)}</td>
                          <td className="num" style={{ color: studentsView.totals.debt > 0 ? 'var(--red)' : 'var(--success)' }}>
                            {fmt(studentsView.totals.debt)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {expenseForm && (
          <ExpenseModal
            form={expenseForm}
            setForm={setExpenseForm}
            onSave={handleSaveExpense}
            onClose={() => { setExpenseForm(null); setEditingExpense(null); }}
            saving={savingExpense}
            editing={!!editingExpense}
          />
        )}
      </div>
    </div>
  );
}
