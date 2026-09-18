import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui';
import { useT } from '@/i18n';

export default function AccountLayout() {
  const t = useT();
  const LINKS = [
    { to: '/account', label: t('account.profile'), end: true },
    { to: '/account/orders', label: t('nav.orders') },
    { to: '/account/returns', label: t('nav.returns') },
  ];
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-ink-900">{t('account.title')}</h1>
      <p className="mt-1 text-sm text-ink-600">{t('account.signedInAs', { email: user?.email ?? '' })}</p>

      <div className="mt-8 grid gap-8 md:grid-cols-[14rem_1fr]">
        <nav aria-label={t('account.nav')} className="md:border-r md:border-ink-200 md:pr-6">
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {LINKS.map((link) => (
              <li key={link.to} className="shrink-0">
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    cn(
                      'block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            <li className="shrink-0 md:mt-4 md:border-t md:border-ink-200 md:pt-4">
              <Button
                variant="ghost"
                className="w-full justify-start px-3 text-sm font-medium text-ink-600"
                onClick={() => void logout().then(() => navigate('/'))}
              >
                {t('nav.signOut')}
              </Button>
            </li>
          </ul>
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
