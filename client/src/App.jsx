import { Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';

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
        <RequireAuth roles={['ADMIN', 'TEACHER', 'PARENT', 'PHYSICAL_TRAINER']}>
          <AttendanceFlow />
        </RequireAuth>
      } />

      <Route path="/makeups/:id/attendance" element={
        <RequireAuth roles={['ADMIN', 'TEACHER', 'PHYSICAL_TRAINER']}>
          <MakeupAttendancePage />
        </RequireAuth>
      } />

      <Route path="/parent" element={
        <RequireAuth roles={['PARENT', 'ADMIN']}>
          <ParentPortalPage />
        </RequireAuth>
      } />

      <Route path="/my-payroll" element={
        <RequireAuth roles={['TEACHER', 'ASSISTANT']}>
          <MyPayrollPage />
        </RequireAuth>
      } />

      <Route path="/admin" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <AdminDashboard />
        </RequireAuth>
      } />
      <Route path="/admin/students" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <StudentsPage />
        </RequireAuth>
      } />
      <Route path="/admin/groups" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <GroupsPage />
        </RequireAuth>
      } />
      <Route path="/admin/makeups" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <MakeupsPage />
        </RequireAuth>
      } />
      <Route path="/admin/events" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <EventsPage />
        </RequireAuth>
      } />
      <Route path="/admin/reports" element={
        <RequireAuth roles={['ADMIN', 'PHYSICAL_TRAINER']}>
          <ReportsPage />
        </RequireAuth>
      } />
      {/* ADMIN-only routes */}
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
      <Route path="/admin/professors" element={
        <RequireAuth roles={['ADMIN']}>
          <ProfessorsPage />
        </RequireAuth>
      } />
      <Route path="/admin/assistants" element={
        <RequireAuth roles={['ADMIN']}>
          <AssistantsPage />
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
