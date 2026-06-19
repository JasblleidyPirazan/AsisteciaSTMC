import { useState } from 'react';
import { api } from '../../api/client.js';

// Agregar estudiante de reposición desde cualquier grupo (HU-AST-02).
export default function AddReposition({ existingIds, onAdd }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  async function search(value) {
    setQ(value);
    if (value.trim().length < 2) { setResults([]); return; }
    setBusy(true);
    try {
      const d = await api.get(`/students/search?q=${encodeURIComponent(value)}`);
      setResults(d.students.filter((s) => !existingIds.includes(s.id)));
    } catch { setResults([]); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button className="btn btn-outline" onClick={() => setOpen(true)} style={{ marginBottom: 14 }}>
        ➕ Agregar reposición
      </button>
    );
  }

  return (
    <div className="card stack">
      <div className="field" style={{ margin: 0 }}>
        <label>Buscar estudiante</label>
        <input value={q} onChange={(e) => search(e.target.value)} placeholder="Nombre del estudiante" autoFocus />
      </div>
      {busy && <p className="muted">Buscando…</p>}
      {results.map((s) => (
        <button key={s.id} className="list-link" onClick={() => { onAdd(s); setOpen(false); setQ(''); setResults([]); }}>
          {s.name}
        </button>
      ))}
      <button className="btn btn-outline" onClick={() => setOpen(false)}>Cancelar</button>
    </div>
  );
}
