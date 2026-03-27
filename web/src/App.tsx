import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout.js";
import HomePage from "@/pages/Home.js";
import GruendungPage from "@/pages/Gruendung.js";
import FoerderungPage from "@/pages/Foerderung.js";
import ResearchPage from "@/pages/Research.js";
import ResearchDataProvenancePage from "@/pages/ResearchDataProvenance.js";
import ResearchPrimarySourceVerificationPage from "@/pages/ResearchPrimarySourceVerification.js";
import ResearchAiAssistedExtractionPage from "@/pages/ResearchAiAssistedExtraction.js";
import ResearchBlockchainIntegrityPage from "@/pages/ResearchBlockchainIntegrity.js";
import ResearchStorageArchitecturesPage from "@/pages/ResearchStorageArchitectures.js";
import AssistantPage from "@/pages/Assistant.js";
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
        <Route path="/research/data-provenance-freshness" element={<ResearchDataProvenancePage />} />
        <Route path="/research/primary-source-verification" element={<ResearchPrimarySourceVerificationPage />} />
        <Route path="/research/ai-assisted-extraction" element={<ResearchAiAssistedExtractionPage />} />
        <Route path="/research/blockchain-data-integrity" element={<ResearchBlockchainIntegrityPage />} />
        <Route path="/research/storage-architectures" element={<ResearchStorageArchitecturesPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
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
