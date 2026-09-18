import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui';
import { I18nProvider } from '@/i18n';
import { RedirectIfAuthenticated, RequireAuth, RequireCustomer, RequireRole } from '@/components/guards/RouteGuards';
import { tokenStore } from '@/lib/apiClient';
import { AuthApi } from '@/api/auth.api';
import { ADMIN, CUSTOMER } from './helpers';

function renderRoutes(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={[initialPath]}>
          <ToastProvider>
            <AuthProvider>
            <Routes>
              <Route path="/" element={<div>Storefront</div>} />
              <Route path="/login" element={<div>Login page</div>} />
              <Route element={<RequireRole role="SUPER_ADMIN" redirectTo="/" />}>
                <Route path="/admin" element={<div>Admin dashboard</div>} />
              </Route>
              <Route element={<RequireCustomer />}>
                <Route path="/account" element={<div>My account</div>} />
              </Route>
              <Route element={<RequireAuth />}>
                <Route path="/protected" element={<div>Protected content</div>} />
              </Route>
              <Route element={<RedirectIfAuthenticated />}>
                <Route path="/register" element={<div>Register page</div>} />
              </Route>
            </Routes>
            </AuthProvider>
          </ToastProvider>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

/** Signs in for real and leaves the refresh token where AuthProvider will find it. */
async function establishSession(credentials: { email: string; password: string }) {
  tokenStore.clear();
  const result = await AuthApi.login(credentials.email, credentials.password);
  return result;
}

describe('route guards', () => {
  it('sends an anonymous visitor from /admin to the login page', async () => {
    tokenStore.clear();
    renderRoutes('/admin');
    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    expect(screen.queryByText('Admin dashboard')).not.toBeInTheDocument();
  });

  it('redirects a CUSTOMER away from /admin to the storefront', async () => {
    await establishSession(CUSTOMER);
    renderRoutes('/admin');

    await waitFor(() => expect(screen.getByText('Storefront')).toBeInTheDocument());
    expect(screen.queryByText('Admin dashboard')).not.toBeInTheDocument();
  });

  it('lets a SUPER_ADMIN into /admin', async () => {
    await establishSession(ADMIN);
    renderRoutes('/admin');
    await waitFor(() => expect(screen.getByText('Admin dashboard')).toBeInTheDocument());
  });

  it('sends a SUPER_ADMIN from the customer account area to the back office', async () => {
    await establishSession(ADMIN);
    renderRoutes('/account');

    // The admin is not a shopper: they land on the dashboard, not the account page.
    await waitFor(() => expect(screen.getByText('Admin dashboard')).toBeInTheDocument());
    expect(screen.queryByText('My account')).not.toBeInTheDocument();
  });

  it('lets a CUSTOMER into their account area', async () => {
    await establishSession(CUSTOMER);
    renderRoutes('/account');
    await waitFor(() => expect(screen.getByText('My account')).toBeInTheDocument());
  });

  it('requires any session for a generally protected route', async () => {
    tokenStore.clear();
    renderRoutes('/protected');
    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
  });

  it('keeps a signed-in user off the registration page', async () => {
    await establishSession(CUSTOMER);
    renderRoutes('/register');
    await waitFor(() => expect(screen.getByText('Storefront')).toBeInTheDocument());
    expect(screen.queryByText('Register page')).not.toBeInTheDocument();
  });

  it('shows the registration page to an anonymous visitor', async () => {
    tokenStore.clear();
    renderRoutes('/register');
    await waitFor(() => expect(screen.getByText('Register page')).toBeInTheDocument());
  });
});
