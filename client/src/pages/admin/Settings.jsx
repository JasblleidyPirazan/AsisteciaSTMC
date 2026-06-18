import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Banner, Header, Loading } from '../../components/ui.jsx';

// HU-ADM-01: configurar tarifas del sistema.
export default function Settings() {
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.get('/admin/settings').then((d) => {
      const s = d.settings || { studentRate: 0, assistantFixedRate: 0, groupMakeupRate: 0 };
      setForm({
        studentRate: Number(s.studentRate),
        assistantFixedRate: Number(s.assistantFixedRate),
        groupMakeupRate: Number(s.groupMakeupRate),
      });
    }).catch((e) => setError(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setError(null); setMsg(null);
    try {
      await api.put('/admin/settings', {
        studentRate: Number(form.studentRate),
        assistantFixedRate: Number(form.assistantFixedRate),
        groupMakeupRate: Number(form.groupMakeupRate),
      });
      setMsg('Tarifas actualizadas. Aplican de ahora en adelante.');
    } catch (err) { setError(err.message); }
  }

  if (!form) return <Loading />;

  const fields = [
    ['studentRate', 'Tarifa por estudiante (profesor)'],
    ['assistantFixedRate', 'Tarifa fija por clase (asistente)'],
    ['groupMakeupRate', 'Tarifa por estudiante en reposición grupal'],
  ];

  return (
    <>
      <Header title="Tarifas" back="/admin" />
      <div className="content">
        {error && <Banner>{error}</Banner>}
        {msg && <Banner type="success">{msg}</Banner>}
        <form className="card stack" onSubmit={save}>
          {fields.map(([key, label]) => (
            <div className="field" style={{ margin: 0 }} key={key}>
              <label>{label}</label>
              <input type="number" min="0" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <button className="btn btn-primary">Guardar tarifas</button>
        </form>
        <p className="muted">Los cambios no afectan liquidaciones ya registradas: cada cálculo conserva la tarifa vigente al momento del registro.</p>
      </div>
    </>
  );
}
