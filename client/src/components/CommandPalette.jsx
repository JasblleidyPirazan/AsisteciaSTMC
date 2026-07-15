import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

// Buscador global (⌘K / Ctrl+K): encuentra estudiantes y grupos y salta a su
// detalle. Navegación por teclado (↑↓ para moverse, ↵ para abrir, esc cierra).
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ students: [], groups: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  // Lista plana (estudiantes y luego grupos) para navegar con el teclado.
  const items = [
    ...res.students.map((s) => ({
      type: 'student', id: s.id, label: s.name, trial: s.isTrial,
      sub: [s.groupCode, s.document].filter(Boolean).join(' · '),
    })),
    ...res.groups.map((g) => ({
      type: 'group', id: g.id, code: g.code, label: g.code,
      sub: [g.ballLevel && `${g.ballLevel}${g.subLevel ? ` ${g.subLevel}` : ''}`, g.professor?.name].filter(Boolean).join(' · '),
    })),
  ];

  useEffect(() => {
    if (open) {
      setQ(''); setRes({ students: [], groups: [] }); setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  // Búsqueda con debounce.
  useEffect(() => {
    if (!open) return undefined;
    const query = q.trim();
    if (query.length < 2) { setRes({ students: [], groups: [] }); return undefined; }
    const t = setTimeout(async () => {
      setLoading(true);
      try { setRes(await api.get('/search', { q: query })); setActive(0); }
      catch { setRes({ students: [], groups: [] }); }
      finally { setLoading(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = useCallback((it) => {
    if (!it) return;
    if (it.type === 'student') navigate('/admin/students', { state: { focusStudentId: it.id } });
    else navigate('/admin/groups', { state: { focusCode: it.code } });
    onClose();
  }, [navigate, onClose]);

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }

  if (!open) return null;

  const tooShort = q.trim().length < 2;
  const row = (it, i) => (
    <button key={`${it.type}-${it.id}`} className={`cmdk-row${i === active ? ' active' : ''}`}
      onMouseEnter={() => setActive(i)} onClick={() => go(it)}>
      <span className="cmdk-ico">{it.type === 'student' ? '👤' : '🎾'}</span>
      <span className="cmdk-label">{it.label}{it.trial ? ' 🧪' : ''}</span>
      {it.sub && <span className="cmdk-sub">{it.sub}</span>}
    </button>
  );

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} className="cmdk-input" placeholder="Buscar estudiante o grupo…"
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} />
        <div className="cmdk-results">
          {tooShort ? (
            <div className="cmdk-empty">Escribe al menos 2 caracteres…</div>
          ) : loading && items.length === 0 ? (
            <div className="cmdk-empty">Buscando…</div>
          ) : items.length === 0 ? (
            <div className="cmdk-empty">Sin resultados para “{q.trim()}”.</div>
          ) : (
            <>
              {res.students.length > 0 && <div className="cmdk-section">Estudiantes</div>}
              {res.students.map((_, i) => row(items[i], i))}
              {res.groups.length > 0 && <div className="cmdk-section">Grupos</div>}
              {res.groups.map((_, j) => { const i = res.students.length + j; return row(items[i], i); })}
            </>
          )}
        </div>
        <div className="cmdk-foot">↑↓ moverse · ↵ abrir · esc cerrar</div>
      </div>
    </div>
  );
}
