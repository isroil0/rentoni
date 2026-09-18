import { describe, expect, it } from 'vitest';
import { AuthApi } from '@/api/auth.api';
import { ApiError, tokenStore } from '@/lib/apiClient';
import { ADMIN, CUSTOMER, registerFreshCustomer, signIn, signOutLocally } from './helpers';

describe('authentication (real API)', () => {
  it('registers a customer and never returns a password or its hash', async () => {
    const { password, email, ...apiResponse } = await registerFreshCustomer();

    expect(apiResponse.user.role).toBe('CUSTOMER');
    expect(apiResponse.user.email).toBe(email);
    expect(apiResponse.accessToken).toBeTruthy();

    // Assert against exactly what the API returned, not the helper's own bookkeeping.
    const serialised = JSON.stringify(apiResponse);
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain(password);
  });

  it('cannot self-register as SUPER_ADMIN even when the role is forced into the payload', async () => {
    const email = `escalate-${Date.now()}@test.local`;
    // Bypasses the typed client to prove the backend — not the form — is the guard.
    const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Escalator', email, password: 'Passw0rd!', role: 'SUPER_ADMIN' }),
    });

    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('signs in an admin and a customer with the right roles', async () => {
    const admin = await signIn(ADMIN);
    expect(admin.user.role).toBe('SUPER_ADMIN');

    const customer = await signIn(CUSTOMER);
    expect(customer.user.role).toBe('CUSTOMER');
  });

  it('rejects invalid credentials with a safe message', async () => {
    await expect(AuthApi.login(CUSTOMER.email, 'WrongPassword1')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('returns the current user from /auth/me', async () => {
    await signIn(CUSTOMER);
    const me = await AuthApi.me();
    expect(me.email).toBe(CUSTOMER.email);
    expect(me).not.toHaveProperty('passwordHash');
  });

  it('logs out so the token no longer works', async () => {
    const fresh = await registerFreshCustomer();
    expect(await AuthApi.me()).toMatchObject({ email: fresh.email });

    await AuthApi.logout();
    expect(tokenStore.getAccessToken()).toBeNull();

    await expect(AuthApi.me()).rejects.toBeInstanceOf(ApiError);
  });

  it('restores a session from the stored refresh token', async () => {
    const fresh = await registerFreshCustomer();
    const storedRefresh = tokenStore.getRefreshToken();
    expect(storedRefresh).toBeTruthy();

    // Simulate a page reload: in-memory access token is gone, refresh token persists.
    signOutLocally();
    localStorage.setItem('rentoni.refreshToken', storedRefresh!);

    const restored = await AuthApi.restore();
    expect(restored?.user.email).toBe(fresh.email);
  });

  it('only persists the refresh token — the access token never reaches storage', async () => {
    const result = await registerFreshCustomer();
    const stored = JSON.stringify(localStorage);
    expect(stored).not.toContain(result.accessToken);
    expect(localStorage.getItem('rentoni.refreshToken')).toBe(result.refreshToken);
  });

  it('transparently refreshes an expired access token and replays the request', async () => {
    const fresh = await registerFreshCustomer();
    // Corrupt the in-memory access token; the client should refresh and retry once.
    tokenStore.set({ accessToken: 'not-a-valid-token', refreshToken: fresh.refreshToken });

    const me = await AuthApi.me();
    expect(me.email).toBe(fresh.email);
  });
});
