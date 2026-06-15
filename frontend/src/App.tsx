import { type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProjectProvider } from './context/ProjectContext';
import HomePage from './pages/HomePage';
import SignInPage from './pages/SignInPage';
import AppShell from './pages/app/AppShell';
import DashboardPage from './pages/app/DashboardPage';
import GeneratePage from './pages/app/GeneratePage';
import KnowledgeBasePage from './pages/app/KnowledgeBasePage';
import ProjectsPage from './pages/app/ProjectsPage';
import RunsPage from './pages/app/RunsPage';
import SettingsPage from './pages/app/SettingsPage';
import ValidationPage from './pages/app/ValidationPage';
import TestCasesPage from './pages/app/TestCasesPage';
import TraceabilityPage from './pages/app/TraceabilityPage';
import ReviewPage from './pages/app/ReviewPage';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/signin" element={<SignInPage />} />

          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="generate" element={<GeneratePage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="test-cases" element={<TestCasesPage />} />
            <Route path="validation" element={<ValidationPage />} />
            <Route path="traceability" element={<TraceabilityPage />} />
            <Route path="knowledge" element={<KnowledgeBasePage />} />
            <Route path="runs" element={<RunsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ProjectProvider>
    </AuthProvider>
  );
}
