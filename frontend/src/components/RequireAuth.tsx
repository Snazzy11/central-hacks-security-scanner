import { Center, Loader } from '@mantine/core';
import { Navigate, Outlet } from 'react-router';

import { useAuth } from '@/features/auth/useAuth';

/** Route guard: renders child routes for logged-in users, redirects everyone else to /login. */
export function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) return <Center h="100vh"><Loader /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
