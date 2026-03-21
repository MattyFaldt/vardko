import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DemoProvider } from './lib/demo-data';
import { AuthProvider } from './lib/auth-context';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BrandingProvider>
        <DemoProvider>
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
        </DemoProvider>
        </BrandingProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
