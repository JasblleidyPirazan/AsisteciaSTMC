import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import { Loading } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import EnrollmentPublic from './pages/EnrollmentPublic.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AttendanceFlow from './pages/attendance/AttendanceFlow.jsx';
import AssistantDay from './pages/AssistantDay.jsx';
import MySettlement from './pages/MySettlement.jsx';
import Students from './pages/Students.jsx';
import StudentHistory from './pages/StudentHistory.jsx';
import AdminHome from './pages/admin/AdminHome.jsx';

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <div className="app">
      <Routes>
        {/* Público */}
        <Route path="/login" element={<Login />} />
        <Route path="/enrollment" element={<EnrollmentPublic />} />

        {/* Autenticado */}
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/attendance/:groupId" element={<Protected><AttendanceFlow /></Protected>} />
        <Route path="/assistant" element={<Protected roles={['ASSISTANT', 'ADMIN']}><AssistantDay /></Protected>} />
        <Route path="/my-settlement" element={<Protected><MySettlement /></Protected>} />
        <Route path="/students" element={<Protected roles={['TEACHER', 'PARENT', 'ADMIN']}><Students /></Protected>} />
        <Route path="/students/:id" element={<Protected roles={['TEACHER', 'PARENT', 'ADMIN']}><StudentHistory /></Protected>} />
        <Route path="/admin/*" element={<Protected roles={['ADMIN']}><AdminHome /></Protected>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
