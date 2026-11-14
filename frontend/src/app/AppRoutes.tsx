import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { AppLayout } from '@/components/AppLayout';
import { RequireAuth } from '@/components/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { RedactionPage } from '@/features/redaction_page/RedactionPage';

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Everything inside RequireAuth needs a logged-in user */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/redact" replace />} />
            <Route path="redact" element={<RedactionPage />} />
            {/* New pages go here: <Route path="thing" element={<ThingPage />} /> */}
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
