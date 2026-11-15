import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { AppLayout } from '@/components/AppLayout';
import { RequireAuth } from '@/components/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { ExtensionPage } from '@/features/extension/ExtensionPage';
import { HomePage } from '@/features/home/HomePage';
import { RedactionPage } from '@/features/redaction_page/RedactionPage';
import { ResultsPage } from '@/features/results/ResultsPage';

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/extension" element={<ExtensionPage />} />

        {/* Everything inside RequireAuth needs a logged-in user */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="redact" element={<RedactionPage />} />
            <Route path="results/:batchId" element={<ResultsPage />} />
            {/* New pages go here: <Route path="thing" element={<ThingPage />} /> */}
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
