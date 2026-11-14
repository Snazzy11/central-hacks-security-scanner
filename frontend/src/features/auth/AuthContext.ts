import { createContext } from 'react';

import type { RegisterData, User } from './types';

export interface AuthState {
  user: User | null;
  /** True until we've checked whether a saved token is still valid. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);
