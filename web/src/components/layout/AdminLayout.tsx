import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Drawer } from '@/components/ui';
import { ADMIN_NAV, AdminSidebarNav } from './AdminSidebar';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ScrollToTop } from './ScrollToTop';
import { useT } from '@/i18n';

/**
 * Back-office shell: a persistent sidebar on desktop, a drawer below `lg`, and a top bar
 * carrying the page title and the admin account menu.
 */
export default function AdminLayout() {
  const t = useT();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const current =
    [...ADMIN_NAV]
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));

  return (
    <div className="min-h-screen bg-ink-50">
      <a href="#admin-main" className="skip-link">
        {t('common.skipToContent')}
      </a>
      <ScrollToTop />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-ink-200 bg-white lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-ink-200 px-5">
          <Link to="/admin" className="flex items-center gap-2 font-semibold tracking-tight text-ink-900">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-ink-900 text-sm font-bold text-white">
              R
            </span>
            Rentoni
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AdminSidebarNav />
        </div>
        <div className="border-t border-ink-200 p-3">
          <Link to="/" className="block rounded-md px-3 py-2 text-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900">
            {t('nav.viewStorefront')} →
          </Link>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200 bg-white px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t('admin.nav.openNavigation')}
            className="rounded-md p-2 text-ink-600 hover:bg-ink-100 lg:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <h1 className="truncate text-base font-semibold text-ink-900">
            {current ? t(current.labelKey) : t('admin.nav.admin')}
          </h1>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden lg:block">
              <LanguageSwitcher />
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink-900">{user?.name}</p>
              <p className="text-xs text-ink-500">{t('admin.nav.superAdmin')}</p>
            </div>
            <div className="group relative">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 text-sm font-semibold text-white"
                aria-label={t('admin.nav.accountMenu')}
                aria-haspopup="true"
              >
                {user?.name?.charAt(0).toUpperCase() ?? 'A'}
              </button>
              <div className="invisible absolute right-0 top-full z-10 w-48 rounded-md border border-ink-200 bg-white py-1 opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <p className="truncate border-b border-ink-100 px-4 py-2 text-xs text-ink-500">{user?.email}</p>
                <Link to="/admin/settings" className="block px-4 py-2 text-sm text-ink-700 hover:bg-ink-50">
                  {t('admin.nav.settings')}
                </Link>
                <Link to="/" className="block px-4 py-2 text-sm text-ink-700 hover:bg-ink-50">
                  {t('nav.viewStorefront')}
                </Link>
                <button
                  type="button"
                  onClick={() => void logout().then(() => navigate('/login'))}
                  className="block w-full px-4 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
                >
                  {t('nav.signOut')}
                </button>
              </div>
            </div>
          </div>
        </header>

        <main id="admin-main" className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={t('admin.nav.navigation')} side="left">
        <AdminSidebarNav onNavigate={() => setMenuOpen(false)} />
        <div className="border-t border-ink-200 p-3">
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="block rounded-md px-3 py-2 text-sm text-ink-600 hover:bg-ink-100"
          >
            {t('nav.viewStorefront')} →
          </Link>
          <div className="border-t border-ink-200 p-3 lg:hidden">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">{t('common.language')}</p>
            <LanguageSwitcher />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
