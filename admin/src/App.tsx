import { Routes, Route, Navigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout.js";
import LoginPage from "@/pages/Login.js";
import OverviewPage from "@/pages/Overview.js";
import PipelinesPage from "@/pages/Pipelines.js";
import ProgramsPage from "@/pages/Programs.js";
import InstitutionsPage from "@/pages/Institutions.js";
import RegulationsPage from "@/pages/Regulations.js";
import ApiKeysPage from "@/pages/ApiKeys.js";
import UsersPage from "@/pages/Users.js";
import DataQualityPage from "@/pages/DataQuality.js";
import SettingsPage from "@/pages/Settings.js";
import { useAuth } from "@/hooks/useAuth.js";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Routes>
                <Route index element={<OverviewPage />} />
                <Route path="pipelines" element={<PipelinesPage />} />
                <Route path="programs" element={<ProgramsPage />} />
                <Route path="institutions" element={<InstitutionsPage />} />
                <Route path="regulations" element={<RegulationsPage />} />
                <Route path="api-keys" element={<ApiKeysPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="data-quality" element={<DataQualityPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Routes>
            </AdminLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
