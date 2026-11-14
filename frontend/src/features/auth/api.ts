import { api } from '@/lib/api';

import type { Token, User } from './types';

export const fetchMe = () => api<User>('/auth/me');

export const loginRequest = (email: string, password: string) =>
  // FastAPI's OAuth2 login expects form-encoded `username` + `password`
  api<Token>('/auth/login', {
    method: 'POST',
    body: new URLSearchParams({ username: email, password }),
  });

export const registerRequest = (email: string, password: string) =>
  api<Token>('/auth/register', { method: 'POST', json: { email, password } });
