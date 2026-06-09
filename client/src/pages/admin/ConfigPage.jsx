import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

export default function ConfigPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState({ rate_per_student: '', assistant_fixed_rate: '', reposition_rate: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/config').then(setConfig).finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/config', config);
      setSaved(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="nav-back" onClick={() => navigate('/admin')}>←</button>
        <h1>Configuración de Tarifas</h1>
      </div>

      <div className="page-content">
        {saved && <div className="alert alert-success">✅ Tarifas actualizadas correctamente.</div>}

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">Tarifa por estudiante — Profesor (COP)</label>
            <input type="number" className="form-input" value={config.rate_per_student}
              onChange={(e) => setConfig({ ...config, rate_per_student: e.target.value })}
              placeholder="15000" min="0" />
            <span className="text-xs text-gray">
              Pago al profesor por cada estudiante presente × unidades de la clase
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Tarifa fija — Asistente (COP)</label>
            <input type="number" className="form-input" value={config.assistant_fixed_rate}
              onChange={(e) => setConfig({ ...config, assistant_fixed_rate: e.target.value })}
              placeholder="12000" min="0" />
            <span className="text-xs text-gray">
              Pago fijo al asistente por clase × unidades
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Tarifa reposición por estudiante (COP)</label>
            <input type="number" className="form-input" value={config.reposition_rate}
              onChange={(e) => setConfig({ ...config, reposition_rate: e.target.value })}
              placeholder="15000" min="0" />
            <span className="text-xs text-gray">
              Tarifa por estudiante en reposición (puede ser diferente a la regular)
            </span>
          </div>

          <div className="card mb-4" style={{ background: 'var(--blue-light)' }}>
            <h3 className="mb-2">Ejemplo de cálculo actual</h3>
            <div className="text-sm">
              <p>Clase sencilla, 3 presentes:</p>
              <p className="font-medium mt-1">
                Profesor: 3 × {Number(config.rate_per_student || 0).toLocaleString('es-CO')} × 1 ={' '}
                {(3 * Number(config.rate_per_student || 0)).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
              </p>
              <p className="font-medium">
                Asistente: {Number(config.assistant_fixed_rate || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })} × 1
              </p>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar tarifas'}
          </button>
        </form>
      </div>
    </div>
  );
}
