import { AuthApi } from '@/api/auth.api';
import { tokenStore } from '@/lib/apiClient';

export const ADMIN = { email: 'admin@rentoni.test', password: 'Admin@12345' };
export const CUSTOMER = { email: 'customer1@rentoni.test', password: 'Customer@123' };
export const CUSTOMER_TWO = { email: 'customer2@rentoni.test', password: 'Customer@123' };

/** Signs in through the real API and leaves the token in the shared client. */
export async function signIn(credentials: { email: string; password: string }) {
  return AuthApi.login(credentials.email, credentials.password);
}

export async function signInAsAdmin() {
  return signIn(ADMIN);
}

export async function signInAsCustomer() {
  return signIn(CUSTOMER);
}

export function signOutLocally() {
  tokenStore.clear();
}

/** Registers a throwaway customer so tests never interfere with each other's data. */
export async function registerFreshCustomer() {
  const email = `web-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const result = await AuthApi.register({ name: 'Web Test Customer', email, password: 'Passw0rd!' });
  return { ...result, email, password: 'Passw0rd!' };
}

export interface CapturedSession {
  accessToken: string | null;
  refreshToken: string | null;
}

/**
 * Captures the currently signed-in session so a test can switch to another identity
 * (e.g. check something as admin) and then switch back, rather than relying on
 * whichever refresh token happens to be in storage.
 */
export function captureSession(): CapturedSession {
  return { accessToken: tokenStore.getAccessToken(), refreshToken: tokenStore.getRefreshToken() };
}

export function restoreSession(session: CapturedSession) {
  if (session.accessToken && session.refreshToken) {
    tokenStore.set({ accessToken: session.accessToken, refreshToken: session.refreshToken });
  }
}

/** Runs `fn` as the admin, then restores whoever was signed in before. */
export async function asAdmin<T>(fn: () => Promise<T>): Promise<T> {
  const previous = captureSession();
  await signInAsAdmin();
  try {
    return await fn();
  } finally {
    restoreSession(previous);
  }
}
