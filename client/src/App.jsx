import { Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { PermissionsProvider, usePermissions } from './hooks/usePermissions';
import AppShell from './components/AppShell';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TomarListaPage from './pages/TomarListaPage';
import RolesAccesosPage from './pages/admin/RolesAccesosPage';
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

function RequireAuth({ children, roles, module }) {
  const { user } = useAuth();
  const { can, loading } = usePermissions();
  if (!user) return <Navigate to="/login" replace />;
  if (module) {
    if (loading) return <div className="page"><div className="spinner" /></div>;
    if (!can(module, 'view')) return <Navigate to="/" replace />;
  } else if (roles && !roles.includes(user.role)) {
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
            : (user?.role === 'TEACHER' || user?.role === 'ASSISTANT') ? <Navigate to="/tomar-lista" />
            : <Shell><DashboardPage /></Shell>}
        </RequireAuth>
      } />

      <Route path="/tomar-lista" element={
        <RequireAuth module="pasar_lista">
          <Shell><TomarListaPage /></Shell>
        </RequireAuth>
      } />

      <Route path="/attendance/:groupId" element={
        <RequireAuth module="pasar_lista">
          <AttendanceFlow />
        </RequireAuth>
      } />

      <Route path="/makeups/:id/attendance" element={
        <RequireAuth module="reposiciones">
          <MakeupAttendancePage />
        </RequireAuth>
      } />

      <Route path="/festivals/:id/attendance" element={
        <RequireAuth module="festivales">
          <FestivalAttendancePage />
        </RequireAuth>
      } />

      <Route path="/parent" element={
        <RequireAuth module="tablero">
          <Shell><ParentPortalPage /></Shell>
        </RequireAuth>
      } />

      <Route path="/my-payroll" element={
        <RequireAuth module="nomina">
          <Shell><MyPayrollPage /></Shell>
        </RequireAuth>
      } />

      <Route path="/admin" element={
        <RequireAuth module="tablero">
          <Shell><AdminDashboard /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/students" element={
        <RequireAuth module="estudiantes">
          <Shell><StudentsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/groups" element={
        <RequireAuth module="grupos">
          <Shell><GroupsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/makeups" element={
        <RequireAuth module="reposiciones">
          <Shell><MakeupsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/events" element={
        <RequireAuth module="festivales">
          <Shell><EventsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/reports" element={
        <RequireAuth module="informes">
          <Shell><ReportsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/validation" element={
        <RequireAuth module="revisiones">
          <Shell><ValidationPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/festivals" element={
        <RequireAuth module="festivales">
          <Shell><FestivalsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/alerts" element={
        <RequireAuth module="informes">
          <Shell><AlertsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/payroll" element={
        <RequireAuth module="nomina">
          <Shell><PayrollPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/config" element={
        <RequireAuth module="configuracion">
          <Shell><ConfigPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/enrollment" element={
        <RequireAuth module="estudiantes">
          <Shell><EnrollmentRequestsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/professors" element={
        <RequireAuth module="roles_accesos">
          <Shell><ProfessorsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/assistants" element={
        <RequireAuth module="roles_accesos">
          <Shell><AssistantsPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/users" element={
        <RequireAuth module="roles_accesos">
          <Shell><UsersPage /></Shell>
        </RequireAuth>
      } />
      <Route path="/admin/roles" element={
        <RequireAuth module="roles_accesos">
          <Shell><RolesAccesosPage /></Shell>
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
          <PermissionsProvider>
            <AppRoutes />
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
