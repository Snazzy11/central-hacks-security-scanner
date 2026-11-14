import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { clearToken, getToken, setToken } from '@/lib/api';

import { fetchMe, loginRequest, registerRequest } from './api';
import { AuthContext, type AuthState } from './AuthContext';
import type { User } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      setUser(await fetchMe());
    }
    catch {
      clearToken(); // expired or invalid
      setUser(null);
    }
  }, []);

  // Restore the session on first load. No token means nothing to check.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    void loadUser().finally(() => setLoading(false));
  }, [loadUser]);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    login: async (email, password) => {
      setToken((await loginRequest(email, password)).access_token);
      await loadUser();
    },
    register: async (data) => {
      setToken((await registerRequest(data)).access_token);
      await loadUser();
    },
    logout: () => {
      clearToken();
      setUser(null);
      queryClient.clear(); // don't leave the last user's data cached
    },
  }), [user, loading, loadUser, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
