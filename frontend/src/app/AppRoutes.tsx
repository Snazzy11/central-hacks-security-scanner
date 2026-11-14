import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { AppLayout } from '@/components/AppLayout';
import { RequireAuth } from '@/components/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { NotesPage } from '@/features/notes/NotesPage';

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Everything inside RequireAuth needs a logged-in user */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<NotesPage />} />
            {/* New pages go here: <Route path="thing" element={<ThingPage />} /> */}
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
