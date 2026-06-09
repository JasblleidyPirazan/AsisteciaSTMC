import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AttendanceFlow from './pages/AttendanceFlow/index';
import EnrollmentPage from './pages/EnrollmentPage';
import ParentPortalPage from './pages/parent/ParentPortalPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import StudentsPage from './pages/admin/StudentsPage';
import PayrollPage from './pages/admin/PayrollPage';
import ConfigPage from './pages/admin/ConfigPage';
import EnrollmentRequestsPage from './pages/admin/EnrollmentRequestsPage';

function RequireAuth({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/enrollment" element={<EnrollmentPage />} />

      <Route path="/" element={
        <RequireAuth>
          {user?.role === 'PARENT' ? <Navigate to="/parent" /> : <DashboardPage />}
        </RequireAuth>
      } />

      <Route path="/attendance/:groupId" element={
        <RequireAuth roles={['ADMIN', 'TEACHER', 'PARENT']}>
          <AttendanceFlow />
        </RequireAuth>
      } />

      <Route path="/parent" element={
        <RequireAuth roles={['PARENT', 'ADMIN']}>
          <ParentPortalPage />
        </RequireAuth>
      } />

      <Route path="/admin" element={
        <RequireAuth roles={['ADMIN']}>
          <AdminDashboard />
        </RequireAuth>
      } />
      <Route path="/admin/students" element={
        <RequireAuth roles={['ADMIN']}>
          <StudentsPage />
        </RequireAuth>
      } />
      <Route path="/admin/payroll" element={
        <RequireAuth roles={['ADMIN']}>
          <PayrollPage />
        </RequireAuth>
      } />
      <Route path="/admin/config" element={
        <RequireAuth roles={['ADMIN']}>
          <ConfigPage />
        </RequireAuth>
      } />
      <Route path="/admin/enrollment" element={
        <RequireAuth roles={['ADMIN']}>
          <EnrollmentRequestsPage />
        </RequireAuth>
      } />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
