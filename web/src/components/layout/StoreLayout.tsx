import { Outlet } from 'react-router-dom';
import { StoreHeader } from './StoreHeader';
import { StoreFooter } from './StoreFooter';
import { ScrollToTop } from './ScrollToTop';
import { useT } from '@/i18n';

export function StoreLayout() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        {t('common.skipToContent')}
      </a>
      <ScrollToTop />
      <StoreHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <StoreFooter />
    </div>
  );
}
