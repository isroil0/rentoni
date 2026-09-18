import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SystemApi } from '@/api/system.api';
import { qk } from '@/lib/queryClient';
import { setCurrency } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';

/**
 * Applies the store's configured currency to every formatted price.
 *
 * The settings endpoint is admin-only, so this runs for a signed-in SUPER_ADMIN; the
 * storefront falls back to the default currency, which is the documented behaviour
 * rather than an extra public endpoint invented for the frontend.
 */
export function CurrencyLoader() {
  const { isAdmin } = useAuth();

  const settings = useQuery({
    queryKey: qk.admin.settings(),
    queryFn: () => SystemApi.getSettings(),
    enabled: isAdmin,
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    const code = settings.data?.['store.currency'];
    if (code) setCurrency(code);
  }, [settings.data]);

  return null;
}
