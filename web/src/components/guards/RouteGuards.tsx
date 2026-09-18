import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui';
import { LoadingState } from '@/components/ui';
import type { Role } from '@/api/types';
import { useT } from '@/i18n';

/**
 * Route guards.
 *
 * These are a usability layer, not the security boundary — the backend rejects any
 * request a role is not entitled to make, and every admin endpoint is protected there
 * independently. The guards exist so users are redirected rather than shown a page that
 * will only fail.
 */

function FullPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingState />
    </div>
  );
}

/** Requires any authenticated user; remembers where the user was heading. */
export function RequireAuth() {
  const { isAuthenticated, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <FullPageLoading />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Requires a specific role. A CUSTOMER hitting /admin is redirected to the storefront. */
export function RequireRole({ role, redirectTo = '/' }: { role: Role; redirectTo?: string }) {
  const { user, isAuthenticated, initializing } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const t = useT();

  const denied = isAuthenticated && user?.role !== role;

  useEffect(() => {
    if (denied) toast.error(t('errors.FORBIDDEN'));
  }, [denied, toast, t]);

  if (initializing) return <FullPageLoading />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (denied) return <Navigate to={redirectTo} replace />;
  return <Outlet />;
}

/**
 * The shopping flow (cart, checkout, account) belongs to customers. A signed-in
 * SUPER_ADMIN is sent to the back office instead — the backend's /customer endpoints
 * reject admins outright, so showing them would only produce errors.
 */
export function RequireCustomer() {
  const { user, isAuthenticated, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <FullPageLoading />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (user?.role === 'SUPER_ADMIN') return <Navigate to="/admin" replace />;
  return <Outlet />;
}

/** Keeps signed-in users off the login/register pages. */
export function RedirectIfAuthenticated() {
  const { user, isAuthenticated, initializing } = useAuth();

  if (initializing) return <FullPageLoading />;
  if (isAuthenticated) return <Navigate to={user?.role === 'SUPER_ADMIN' ? '/admin' : '/'} replace />;
  return <Outlet />;
}
