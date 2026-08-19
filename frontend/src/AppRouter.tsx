import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation
} from "react-router-dom";

import { useAuth } from "./hooks/useAuth";
import InactivityWatcher from "./components/InactivityWatcher";
import Footer from "./components/Footer";

// Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import PendingApproval from "./pages/PendingApproval";
import Register from "./pages/Register";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import NoDashboard from "./pages/NoDashboard";

// Dashboards
import SystemAdminDashboard from "./pages/dashboards/SystemAdminDashboard";
import OwnerDashboard from "./pages/dashboards/OwnerDashboard";
import MaintainerDashboard from "./pages/dashboards/MaintainerDashboard";
import AdminDashboard from "./pages/dashboards/AdminDashboard";
import TeacherDashboard from "./pages/dashboards/TeacherDashboard";
import ParentDashboard from "./pages/dashboards/ParentDashboard";
import StudentDashboard from "./pages/dashboards/StudentDashboard";

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: string[];
}> = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role === "pending") {
    return <Navigate to="/pending" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <div>Forbidden</div>;
  }

  return <>{children}</>;
};

const RoleRouter: React.FC = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case "system_admin":
      return <SystemAdminDashboard />;
    case "owner":
      return <OwnerDashboard />;
    case "maintainer":
      return <MaintainerDashboard />;
    case "admin":
      return <AdminDashboard />;
    case "teacher":
      return <TeacherDashboard />;
    case "parent":
      return <ParentDashboard />;
    case "student":
      return <StudentDashboard />;
    case "pending":
      return <PendingApproval />;
    default:
      return <NoDashboard />;
  }
};

const NO_FOOTER_PATHS = ["/login"];

const AppLayout: React.FC = () => {
  const location = useLocation();
  const showFooter = !NO_FOOTER_PATHS.includes(location.pathname);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ flex: 1 }}>
        <Routes>
          {/* Public pages */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/pending" element={<PendingApproval />} />
          <Route path="/register" element={<Register />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />

          {/* Protected dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <RoleRouter />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {showFooter && <Footer />}
    </div>
  );
};

const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <InactivityWatcher />
      <AppLayout />
    </BrowserRouter>
  );
};

export default AppRouter;
