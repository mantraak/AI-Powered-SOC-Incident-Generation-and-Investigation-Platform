import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./store/authContext";

// Auth pages
import { LoginPage, RegisterPage } from "./pages/auth/AuthPages";

// Admin pages
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminScenariosPage, CreateScenarioPage, ScenarioDetailPage } from "./pages/admin/ScenarioPages";
import { AdminUsersPage } from "./pages/admin/UsersPage";
import { AdminLabsPage } from "./pages/admin/LabsPage";

// Player pages
import { PlayerDashboard } from "./pages/player/PlayerDashboard";
import { PlayerLabsPage } from "./pages/player/PlayerLabsPage";
import { LabInvestigationPage } from "./pages/player/LabInvestigationPage";

function ProtectedRoute({ children, role }: { children: JSX.Element; role?: "admin" | "player" }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-[#0d1117] flex items-center justify-center"><div className="text-[#8b949e]">Loading...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "admin" && user.role !== "admin") return <Navigate to="/player/dashboard" replace />;
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/admin/dashboard" : "/player/dashboard"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Admin routes */}
          <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/scenarios" element={<ProtectedRoute role="admin"><AdminScenariosPage /></ProtectedRoute>} />
          <Route path="/admin/scenarios/create" element={<ProtectedRoute role="admin"><CreateScenarioPage /></ProtectedRoute>} />
          <Route path="/admin/scenarios/:id" element={<ProtectedRoute role="admin"><ScenarioDetailPage /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute role="admin"><AdminUsersPage /></ProtectedRoute>} />
          <Route path="/admin/labs" element={<ProtectedRoute role="admin"><AdminLabsPage /></ProtectedRoute>} />

          {/* Player routes */}
          <Route path="/player/dashboard" element={<ProtectedRoute><PlayerDashboard /></ProtectedRoute>} />
          <Route path="/player/labs" element={<ProtectedRoute><PlayerLabsPage /></ProtectedRoute>} />
          <Route path="/player/labs/:id" element={<ProtectedRoute><LabInvestigationPage /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
