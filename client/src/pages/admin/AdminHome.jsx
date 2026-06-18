import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { Header } from '../../components/ui.jsx';
import Enrollments from './Enrollments.jsx';
import Groups from './Groups.jsx';
import Users from './Users.jsx';
import Settings from './Settings.jsx';
import Reports from './Reports.jsx';
import Settlement from './Settlement.jsx';

function Menu() {
  const navigate = useNavigate();
  const items = [
    ['/admin/enrollments', '📝 Solicitudes de inscripción', 'HU-INS-02'],
    ['/admin/groups', '🎾 Grupos', 'HU-GRP-01'],
    ['/admin/users', '👤 Usuarios (profes/asistentes)', ''],
    ['/admin/settlement', '💰 Liquidación quincenal', 'HU-LIQ-01'],
    ['/admin/reports', '📊 Reportes globales', 'HU-ADM-02'],
    ['/admin/settings', '⚙️ Tarifas', 'HU-ADM-01'],
  ];
  return (
    <>
      <header className="app-header">
        <button className="back" onClick={() => navigate('/')}>⌂</button>
        <h1>Administración</h1>
      </header>
      <div className="content">
        {items.map(([to, label, hu]) => (
          <Link key={to} to={to} className="card tappable" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <div className="row">
              <strong>{label}</strong>
              {hu && <span className="tag">{hu}</span>}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function AdminHome() {
  return (
    <Routes>
      <Route index element={<Menu />} />
      <Route path="enrollments" element={<Enrollments />} />
      <Route path="groups" element={<Groups />} />
      <Route path="users" element={<Users />} />
      <Route path="settlement" element={<Settlement />} />
      <Route path="reports" element={<Reports />} />
      <Route path="settings" element={<Settings />} />
    </Routes>
  );
}

export { Header };
