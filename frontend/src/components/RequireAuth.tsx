import { Center, Loader } from '@mantine/core';
import { Navigate, Outlet } from 'react-router';

import { useAuth } from '@/features/auth/useAuth';

export function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) return <Center h="100vh"><Loader /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
