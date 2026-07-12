import { Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AppShell from './components/AppShell';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AttendanceFlow from './pages/AttendanceFlow/index';
import MakeupAttendancePage from './pages/MakeupAttendancePage';
import EnrollmentPage from './pages/EnrollmentPage';
import ParentPortalPage from './pages/parent/ParentPortalPage';
import MyPayrollPage from './pages/MyPayrollPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import StudentsPage from './pages/admin/StudentsPage';
import GroupsPage from './pages/admin/GroupsPage';
import ProfessorsPage from './pages/admin/ProfessorsPage';
import AssistantsPage from './pages/admin/AssistantsPage';
import EventsPage from './pages/admin/EventsPage';
import ReportsPage from './pages/admin/ReportsPage';
import PayrollPage from './pages/admin/PayrollPage';
import ConfigPage from './pages/admin/ConfigPage';
import EnrollmentRequestsPage from './pages/admin/EnrollmentRequestsPage';
import MakeupsPage from './pages/admin/MakeupsPage';
import UsersPage from './pages/admin/UsersPage';
import ValidationPage from './pages/admin/ValidationPage';
import FestivalsPage from './pages/admin/FestivalsPage';
import FestivalAttendancePage from './pages/FestivalAttendancePage';
import AlertsPage from './pages/admin/AlertsPage';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', maxWidth: 600, margin: '40px auto' }}>
          <h2 style={{ color: '#dc2626', marginBottom: 12 }}>Error al cargar la aplicación</h2>
          <pre style={{ background: '#f3f4f6', padding: 16, borderRadius: 8, overflowX: 'auto', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            style={{ marginTop: 16, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function RequireAuth({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // SUPERADMIN is the superset of ADMIN — it passes every role gate.
  if (roles && user.role !== 'SUPERADMIN' && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

// Envuelve una página de gestión/dashboard en el shell (sidebar + topbar).
// Los flujos inmersivos de asistencia y las páginas públicas NO lo usan.
function Shell({ children }) {
  return <AppShell>{children}</AppShell>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/enrollment" element={<EnrollmentPage />} />

      <Route path="/" element={
        <RequireAuth>
          {user?.role === 'PARENT' ? <Navigate to="/parent" />
            : user?.role === 'RECEPTION' ? <Navigate to="/admin/students" />
            : <Shell><DashboardPage /></Shell>}
        </RequireAuth>
      } />

      <Route path="/attendance/:groupId" element={
        <RequireAuth roles={['ADMIN', 'TEACHER', 'PARENT', 'PHYSICAL_TRAINER']}>
          <AttendanceFlow />
        </RequireAuth>
      } />

      <Route path="/makeups/:id/attendance" element={
        <RequireAuth roles={['ADMIN', 'TEACHER', 'PHYSICAL_TRAINER']}>
          <MakeupAttendancePage />
        </RequireAuth>
      } />

      {/* Professors do NOT report festivals — only the coordinator/admin does.
          A professor who participates is still paid via payroll. */}
      <Route path="/festivals/:id/attendance" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <FestivalAttendancePage />
        </RequireAuth>
      } />

      <Route path="/parent" element={
        <RequireAuth roles={['PARENT', 'ADMIN']}>
          <Shell><ParentPortalPage /></Shell>
        </RequireAuth>
      } />

      <Route path="/my-payroll" element={
        <RequireAuth roles={['TEACHER', 'ASSISTANT']}>
          <Shell><MyPayrollPage /></Shell>
        </RequireAuth>
      } />

      <Route path="/admin" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION']}>
          <Shell><AdminDashboard /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/students" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER', 'RECEPTION']}>
          <Shell><StudentsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/groups" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <Shell><GroupsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/makeups" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <Shell><MakeupsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/events" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <Shell><EventsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/reports" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <Shell><ReportsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/validation" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <Shell><ValidationPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/festivals" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <Shell><FestivalsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/alerts" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <Shell><AlertsPage /></Shell>
        </RequireAuth>
      } />
      {/* ADMIN-only routes */}
      <Route path="/admin/payroll" element={
        <RequireAuth roles={['ADMIN']}>
          <Shell><PayrollPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/config" element={
        <RequireAuth roles={['ADMIN']}>
          <Shell><ConfigPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/enrollment" element={
        <RequireAuth roles={['ADMIN']}>
          <Shell><EnrollmentRequestsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/professors" element={
        <RequireAuth roles={['ADMIN']}>
          <Shell><ProfessorsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/assistants" element={
        <RequireAuth roles={['ADMIN']}>
          <Shell><AssistantsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/users" element={
        <RequireAuth roles={['ADMIN']}>
          <Shell><UsersPage /></Shell>
        </RequireAuth>
      } />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
