import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { Drawer } from '@/components/ui';
import { CartPanel } from '@/components/shop/CartPanel';
import { LanguageSwitcher, LanguageSwitcherCompact } from '@/components/LanguageSwitcher';
import { useT } from '@/i18n';

export function StoreHeader() {
  const t = useT();
  const NAV = [
    { to: '/shop', label: t('nav.shop') },
    { to: '/categories', label: t('nav.categories') },
  ];
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const term = search.trim();
    navigate(term ? `/shop?search=${encodeURIComponent(term)}` : '/shop');
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-900">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-ink-900 text-sm font-bold text-white">
            R
          </span>
          <span>Rentoni</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label={t('nav.mainNav')}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-brand-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden max-w-xs flex-1 md:block" role="search">
          <label htmlFor="store-search" className="sr-only">
            {t('nav.searchShirts')}
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              id="store-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('nav.searchShirts')}
              className="h-9 w-full rounded-md border border-ink-300 bg-white pl-9 pr-3 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative rounded-md p-2 text-ink-600 hover:bg-ink-50 hover:text-ink-900"
            aria-label={t('nav.cartWithCount', { count: itemCount })}
          >
            <CartIcon className="h-5 w-5" />
            {itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </button>

          <div className="hidden md:block">
            <LanguageSwitcherCompact />
          </div>

          {/* Account menu (desktop) */}
          <div className="hidden md:block">
            {isAuthenticated ? (
              <div className="group relative">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
                  aria-haspopup="true"
                >
                  <UserIcon className="h-5 w-5" />
                  <span className="max-w-24 truncate">{user?.name}</span>
                </button>
                <div className="invisible absolute right-0 top-full w-48 rounded-md border border-ink-200 bg-white py-1 opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {isAdmin ? (
                    <Link to="/admin" className="block px-4 py-2 text-sm text-ink-700 hover:bg-ink-50">
                      {t('nav.adminDashboard')}
                    </Link>
                  ) : (
                    <>
                      <Link to="/account" className="block px-4 py-2 text-sm text-ink-700 hover:bg-ink-50">
                        {t('nav.account')}
                      </Link>
                      <Link to="/account/orders" className="block px-4 py-2 text-sm text-ink-700 hover:bg-ink-50">
                        {t('nav.orders')}
                      </Link>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void logout().then(() => navigate('/'))}
                    className="block w-full px-4 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
                  >
                    {t('nav.signOut')}
                  </button>
                </div>
              </div>
            ) : (
              <Link
                to="/login"
                className="rounded-md px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50 hover:text-ink-900"
              >
                {t('nav.signIn')}
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-md p-2 text-ink-600 hover:bg-ink-50 md:hidden"
            aria-label={t('nav.openMenu')}
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={t('nav.menu')} side="left">
        <div className="space-y-6 p-5">
          <form onSubmit={submitSearch} role="search">
            <label htmlFor="mobile-search" className="sr-only">
              {t('nav.searchShirts')}
            </label>
            <input
              id="mobile-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('nav.searchShirts')}
              className="h-10 w-full rounded-md border border-ink-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            />
          </form>

          <nav className="flex flex-col" aria-label={t('nav.mobileNav')}>
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="border-b border-ink-100 py-3 text-sm font-medium text-ink-800"
              >
                {item.label}
              </Link>
            ))}
            {isAuthenticated ? (
              <>
                {isAdmin ? (
                  <Link
                    to="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="border-b border-ink-100 py-3 text-sm font-medium text-ink-800"
                  >
                    {t('nav.adminDashboard')}
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/account"
                      onClick={() => setMenuOpen(false)}
                      className="border-b border-ink-100 py-3 text-sm font-medium text-ink-800"
                    >
                      {t('nav.account')}
                    </Link>
                    <Link
                      to="/account/orders"
                      onClick={() => setMenuOpen(false)}
                      className="border-b border-ink-100 py-3 text-sm font-medium text-ink-800"
                    >
                      {t('nav.orders')}
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout().then(() => navigate('/'));
                  }}
                  className="py-3 text-left text-sm font-medium text-ink-800"
                >
                  {t('nav.signOut')}
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="border-b border-ink-100 py-3 text-sm font-medium text-ink-800"
                >
                  {t('nav.signIn')}
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMenuOpen(false)}
                  className="py-3 text-sm font-medium text-ink-800"
                >
                  {t('nav.createAccount')}
                </Link>
              </>
            )}
          </nav>

          <div className="border-t border-ink-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">{t('common.language')}</p>
            <LanguageSwitcher />
          </div>
        </div>
      </Drawer>

      <Drawer open={cartOpen} onClose={() => setCartOpen(false)} title={t('cart.yourCart')}>
        <CartPanel onNavigate={() => setCartOpen(false)} />
      </Drawer>
    </header>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
