import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout.js";
import HomePage from "@/pages/Home.js";
import GruendungPage from "@/pages/Gruendung.js";
import FoerderungPage from "@/pages/Foerderung.js";
import ResearchPage from "@/pages/Research.js";
import SearchPage from "@/pages/Search.js";
import LoginPage from "@/pages/Login.js";
import RegisterPage from "@/pages/Register.js";
import DashboardPage from "@/pages/Dashboard.js";
import NotFoundPage from "@/pages/NotFound.js";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/gruendung" element={<GruendungPage />} />
        <Route path="/gruendung/foerderung" element={<FoerderungPage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        {/* Redirect old education/regulatory paths */}
        <Route path="/education" element={<Navigate to="/gruendung" replace />} />
        <Route path="/education/*" element={<Navigate to="/gruendung" replace />} />
        <Route path="/institutions" element={<Navigate to="/gruendung" replace />} />
        <Route path="/institutions/*" element={<Navigate to="/gruendung" replace />} />
        <Route path="/regulatory" element={<Navigate to="/gruendung" replace />} />
        <Route path="/regulatory/*" element={<Navigate to="/gruendung" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
