import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { PatientQueuePage } from './features/patient/patient-queue-page.js';
import { DisplayBoardPage } from './features/display/display-board-page.js';
import { StaffPage } from './features/staff/staff-page.js';
import { AdminPage } from './features/admin/admin-page.js';
import { OrgAdminPage } from './features/admin/org-admin-page.js';
import { SuperAdminPage } from './features/superadmin/super-admin-page.js';
import { LoginPage } from './features/auth/login-page.js';
import { HomePage } from './features/home/home-page.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/queue/:clinicSlug" element={<PatientQueuePage />} />
        <Route path="/display/:clinicSlug" element={<DisplayBoardPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/org" element={<OrgAdminPage />} />
        <Route path="/system" element={<SuperAdminPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
