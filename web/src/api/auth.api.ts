import { api, tokenStore } from '@/lib/apiClient';
import type { AuthResult, User } from './types';

export interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
}

export const AuthApi = {
  /** Public registration. The backend hard-codes the role to CUSTOMER. */
  async register(input: RegisterInput): Promise<AuthResult> {
    const result = await api.anonymous.post<AuthResult>('/auth/register', input);
    tokenStore.set(result);
    return result;
  },

  async login(email: string, password: string): Promise<AuthResult> {
    const result = await api.anonymous.post<AuthResult>('/auth/login', { email, password });
    tokenStore.set(result);
    return result;
  },

  /** Restores a session from the persisted refresh token on app boot. */
  async restore(): Promise<AuthResult | null> {
    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const result = await api.anonymous.post<AuthResult>('/auth/refresh', { refreshToken });
      tokenStore.set(result);
      return result;
    } catch {
      tokenStore.clear();
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      tokenStore.clear();
    }
  },

  me: () => api.get<User>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ passwordChanged: boolean }>('/auth/change-password', { currentPassword, newPassword }),
};
