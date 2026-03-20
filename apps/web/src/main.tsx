import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DemoProvider } from './lib/demo-data';
import './index.css';

import { PatientQueuePage } from './features/patient/patient-queue-page';
import { DisplayBoardPage } from './features/display/display-board-page';
import { StaffPage } from './features/staff/staff-page';
import { AdminPage } from './features/admin/admin-page';
import { OrgAdminPage } from './features/admin/org-admin-page';
import { SuperAdminPage } from './features/superadmin/super-admin-page';
import { LoginPage } from './features/auth/login-page';
import { HomePage } from './features/home/home-page';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DemoProvider>
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
      </DemoProvider>
    </BrowserRouter>
  </StrictMode>,
);
