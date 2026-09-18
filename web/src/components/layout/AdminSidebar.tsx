import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n';

export interface AdminNavItem {
  to: string;
  /** Dictionary key rather than literal text, so the sidebar follows the language. */
  labelKey: string;
  icon: (props: { className?: string }) => React.ReactNode;
  end?: boolean;
}

const icon = (path: string) =>
  function Icon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d={path} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

export const ADMIN_NAV: AdminNavItem[] = [
  { to: '/admin', labelKey: 'admin.nav.dashboard', end: true, icon: icon('M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7V11h-7v9Zm0-16v5h7V4h-7Z') },
  { to: '/admin/pos', labelKey: 'admin.nav.pos', icon: icon('M3 6h18M5 6v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6M9 11h6') },
  { to: '/admin/products', labelKey: 'admin.nav.products', icon: icon('M4 7.5 12 3l8 4.5M4 7.5v9L12 21l8-4.5v-9M4 7.5 12 12l8-4.5M12 12v9') },
  { to: '/admin/inventory', labelKey: 'admin.nav.inventory', icon: icon('M3 7h18v13H3V7Zm0 0 2-4h14l2 4M9 12h6') },
  { to: '/admin/purchases', labelKey: 'admin.nav.purchases', icon: icon('M4 5h2l2 11h10l2-8H7M9 20h.01M17 20h.01') },
  { to: '/admin/sales', labelKey: 'admin.nav.sales', icon: icon('M4 19V5m0 14h16M8 15l3.5-4 3 2.5L20 7') },
  { to: '/admin/returns', labelKey: 'admin.nav.returns', icon: icon('M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3') },
  { to: '/admin/customers', labelKey: 'admin.nav.customers', icon: icon('M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9 8a3.5 3.5 0 0 0-5-3.2M3 19a3.5 3.5 0 0 1 5-3.2') },
  { to: '/admin/suppliers', labelKey: 'admin.nav.suppliers', icon: icon('M3 9h13v8H3V9Zm13 2h3l2 3v3h-5v-6ZM7 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z') },
  { to: '/admin/reports', labelKey: 'admin.nav.reports', icon: icon('M6 3h9l4 4v14H6V3Zm9 0v4h4M9 13h6M9 17h6') },
  { to: '/admin/audit-logs', labelKey: 'admin.nav.auditLogs', icon: icon('M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z') },
  { to: '/admin/settings', labelKey: 'admin.nav.settings', icon: icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.2-1.7l2-1.5-2-3.4-2.3 1a8 8 0 0 0-3-1.7L14 2h-4l-.5 2.7a8 8 0 0 0-3 1.7l-2.3-1-2 3.4 2 1.5a8.2 8.2 0 0 0 0 3.4l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 3 1.7L10 22h4l.5-2.7a8 8 0 0 0 3-1.7l2.3 1 2-3.4-2-1.5c.1-.6.2-1.1.2-1.7Z') },
];

export function AdminSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  return (
    <nav aria-label={t('admin.nav.label')} className="flex flex-col gap-0.5 p-3">
      {ADMIN_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-brand-600' : 'text-ink-400')} />
              {t(item.labelKey)}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
