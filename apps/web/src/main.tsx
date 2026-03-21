import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DemoProvider } from './lib/demo-data';
import { ApiDataProvider } from './lib/api-data-provider';
import { AuthProvider, useAuth } from './lib/auth-context';
import { BrandingProvider } from './lib/branding';
import { ProtectedRoute } from './lib/protected-route';
import './index.css';

import { PatientQueuePage } from './features/patient/patient-queue-page';
import { DisplayBoardPage } from './features/display/display-board-page';
import { StaffPage } from './features/staff/staff-page';
import { AdminPage } from './features/admin/admin-page';
import { LoginPage } from './features/auth/login-page';
import { HomePage } from './features/home/home-page';
import { QrEmbedPage } from './features/qr/qr-embed-page';

/**
 * Switches between ApiDataProvider (when authenticated with a real token)
 * and DemoProvider (unauthenticated / demo-mode fallback).
 */
function DataProviderSwitch({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();

  if (accessToken) {
    return <ApiDataProvider>{children}</ApiDataProvider>;
  }

  // No real token — use DemoProvider (demo accounts, public pages)
  return <DemoProvider>{children}</DemoProvider>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BrandingProvider>
        <DataProviderSwitch>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/queue/:clinicSlug" element={<PatientQueuePage />} />
            <Route path="/display/:clinicSlug" element={<DisplayBoardPage />} />
            <Route path="/staff" element={<ProtectedRoute><StaffPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
            <Route path="/qr/:clinicSlug/embed" element={<QrEmbedPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/org" element={<Navigate to="/admin" replace />} />
            <Route path="/system" element={<Navigate to="/admin" replace />} />
          </Routes>
        </DataProviderSwitch>
        </BrandingProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
